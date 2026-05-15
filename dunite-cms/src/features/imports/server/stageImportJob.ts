import 'server-only';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportPreviewPayload } from '../preview/prepareImportPreview';
import type {
  ImportStagingDiagnostics,
  StageImportJobFailure,
  StageImportJobResponse,
  StageImportJobSuccess,
  SupabaseErrorSnapshot,
} from '../types';
import { getImportActor } from './importAuth';
import { normalizedRowToImportRowPayload } from './importPayloadMapper';
import type { ValidationIssue } from '../validation/validationTypes';

const MAX_STAGE_ROWS = 10_000;
const INSERT_CHUNK = 150;

type ImportJobInsertPayload = {
  uploaded_by: string;
  status: 'uploaded';
  file_name: string;
  file_type: string | null;
  total_rows: number;
  upload_source: 'dashboard';
  metadata: {
    timezone: string;
    version: ImportPreviewPayload['version'];
    generated_at: string;
    client_row_count: number;
  };
};

function logStageEvent(event: string, details: Record<string, unknown>) {
  console.info(`[imports:stage] ${event}`, details);
}

function logStageError(event: string, details: Record<string, unknown>) {
  console.error(`[imports:stage] ${event}`, details);
}

function snapshotPostgrestError(err: unknown): SupabaseErrorSnapshot | null {
  if (err == null || typeof err !== 'object') return null;
  const e = err as {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  };
  return {
    code: e.code ?? null,
    message: e.message ?? String(err),
    details: e.details ?? null,
    hint: e.hint ?? null,
  };
}

function friendlyStageMessage(message: string | undefined, phase: ImportStagingDiagnostics['phase']): string {
  const raw = message?.trim();
  if (!raw) return 'Import staging failed. Please try again or contact an administrator.';

  if (/row-level security|rls|violates row-level security/i.test(raw)) {
    return 'Import staging was blocked by permissions. Editors can stage their own imports; admins can stage and manage all imports.';
  }

  if (/column .* does not exist|schema cache|Could not find/i.test(raw)) {
    return 'Import staging could not match the database schema. Refresh the app and verify the latest migrations are applied.';
  }

  if (/duplicate key|unique constraint/i.test(raw)) {
    return 'Import staging found duplicate internal row numbers. Please retry the upload.';
  }

  if (/check constraint/i.test(raw)) {
    return 'Import staging produced data outside the accepted import schema. Review validation issues and retry.';
  }

  const prefix =
    phase === 'job_insert'
      ? 'Could not create the import job'
      : phase === 'rows_insert'
        ? 'Could not persist import rows'
        : phase === 'stats'
          ? 'Could not compute import statistics'
          : phase === 'finalize'
            ? 'Could not finalize the staged import'
            : phase === 'precheck' || phase === 'auth' || phase === 'db_role'
              ? 'Import staging blocked'
              : 'Import staging failed';

  return `${prefix}: ${raw}`;
}

function fail(
  partial: Omit<ImportStagingDiagnostics, 'timestamp'>,
  friendly: string,
  rawMessage?: string,
): StageImportJobFailure {
  const diagnostics: ImportStagingDiagnostics = {
    ...partial,
    timestamp: new Date().toISOString(),
  };
  logStageError('staging.failed', {
    friendly,
    rawMessage: rawMessage ?? null,
    diagnostics,
  });
  return { ok: false, message: friendly, diagnostics };
}

type ImportRowInsert = {
  import_job_id: string;
  row_number: number;
  parsed_data: Record<string, unknown>;
  validation_errors: ValidationIssue[];
  warnings: ValidationIssue[];
  duplicate_flags: Record<string, unknown>;
  processing_state: 'valid' | 'invalid' | 'warning' | 'duplicate';
};

function summarizeRowChunkForDiag(rows: ImportRowInsert[]) {
  return rows.slice(0, 3).map((r) => ({
    row_number: r.row_number,
    processing_state: r.processing_state,
    validation_errors: r.validation_errors,
    warnings: r.warnings,
    duplicate_flags: r.duplicate_flags,
    parsed_data: r.parsed_data,
  }));
}

function buildRowInsertBatch(jobId: string, slice: ImportPreviewPayload['rows'], baseOffset: number): { rows: ImportRowInsert[] } {
  const rows: ImportRowInsert[] = slice.map((r, offset) => {
    const p = normalizedRowToImportRowPayload(r);
    return {
      import_job_id: jobId,
      row_number: baseOffset + offset + 1,
      parsed_data: p.parsed_data,
      validation_errors: p.validation_errors,
      warnings: p.warnings,
      duplicate_flags: p.duplicate_flags,
      processing_state: p.processing_state,
    };
  });
  return { rows };
}

/**
 * Persists a validated client preview into `import_jobs` + `import_rows`, runs
 * duplicate detection RPCs, then marks the job `staged` (ready for execution chunks).
 */
export async function stageImportJobAction(
  payload: ImportPreviewPayload,
  opts: { fileName: string; fileType: string | null },
): Promise<StageImportJobResponse> {
  const baseDiag = (): Omit<ImportStagingDiagnostics, 'timestamp'> => ({
    phase: 'precheck',
    auth_uid: '',
    app_role: '',
    db_current_user_role: null,
    db_role_rpc_error: null,
    insert_job_payload: null,
    inserted_job: null,
    job_insert_error: null,
    rows_insert_error: null,
    rows_chunk: null,
    failing_rows_sample: null,
    stats_error: null,
    finalize_error: null,
    unexpected_message: null,
  });

  try {
    if (payload.version !== 1) {
      return fail(
        { ...baseDiag(), phase: 'precheck', auth_uid: '', app_role: '' },
        'Unsupported import payload version.',
      );
    }
    if (payload.rows.length === 0) {
      return fail({ ...baseDiag(), phase: 'precheck', auth_uid: '', app_role: '' }, 'Nothing to stage.');
    }
    if (payload.rowCount !== payload.rows.length) {
      return fail(
        { ...baseDiag(), phase: 'precheck', auth_uid: '', app_role: '' },
        'Import staging received an inconsistent row count. Re-parse the file and try again.',
      );
    }
    if (payload.rows.length > MAX_STAGE_ROWS) {
      return fail(
        { ...baseDiag(), phase: 'precheck', auth_uid: '', app_role: '' },
        `Too many rows to stage in one job (max ${MAX_STAGE_ROWS.toLocaleString()}).`,
      );
    }

    const { supabase, session, user: verifiedSessionUser } = await createAuthenticatedSupabaseServerClient();
    let actor: Awaited<ReturnType<typeof getImportActor>>;
    try {
      actor = await getImportActor(supabase);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unauthorized.';
      logStageError('staging.auth_failed', { message: msg });
      return fail({ ...baseDiag(), phase: 'auth', auth_uid: '', app_role: '' }, msg);
    }

    const { user, role } = actor;
    const uploadedBy = user.id;

    const {
      data: authSessionUser,
      error: authUidErr,
    } = await supabase.auth.getUser();

    logStageEvent('STAGING USER', {
      actor_user: user,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_role: role,
      verified_session_user_id: verifiedSessionUser.id,
      verified_session_email: verifiedSessionUser.email ?? null,
      auth_session_user: authSessionUser.user,
      auth_session_user_id: authSessionUser.user?.id ?? null,
      session_state: {
        has_session: true,
        has_access_token: Boolean(session.access_token),
        expires_at: session.expires_at ?? null,
        token_type: session.token_type,
      },
      uploaded_by: uploadedBy,
    });

    if (!uploadedBy) {
      logStageError('staging.missing_uploaded_by', {
        actor_user: user,
        actor_role: role,
        auth_session_user: authSessionUser.user,
      });
      throw new Error('Missing uploaded_by before import_jobs insert');
    }

    const authUid = uploadedBy;
    logStageEvent('staging.auth.session', {
      auth_uid_actor: authUid,
      auth_get_user_error: authUidErr,
      auth_session_user_id: authSessionUser.user?.id ?? null,
    });

    const { data: dbRoleRaw, error: dbRoleErr } = await supabase.rpc('current_user_role');
    const dbRole = typeof dbRoleRaw === 'string' ? dbRoleRaw : dbRoleRaw == null ? null : String(dbRoleRaw);

    const { data: authContextRaw, error: authContextErr } = await supabase.rpc('debug_auth_context');
    const authContext = Array.isArray(authContextRaw) ? authContextRaw[0] : authContextRaw;
    logStageEvent('staging.db_role', {
      auth_uid: authUid,
      app_role: role,
      db_current_user_role: dbRole,
      db_role_rpc_error: snapshotPostgrestError(dbRoleErr),
      auth_context_query: authContext ?? null,
      auth_context_query_error: snapshotPostgrestError(authContextErr),
    });

    const totalRows = payload.rowCount;

    const insertPayload: ImportJobInsertPayload = {
      uploaded_by: uploadedBy,
      status: 'uploaded',
      file_name: opts.fileName.slice(0, 520),
      file_type: opts.fileType ? opts.fileType.slice(0, 200) : null,
      total_rows: totalRows,
      upload_source: 'dashboard',
      metadata: {
        timezone: payload.timezone,
        version: payload.version,
        generated_at: payload.generatedAt,
        client_row_count: payload.rowCount,
      },
    };

    const insertPayloadRecord: Record<string, unknown> = { ...insertPayload };

    logStageEvent('FINAL INSERT PAYLOAD', {
      uploaded_by: insertPayload.uploaded_by,
      status: insertPayload.status,
      file_name: insertPayload.file_name,
      total_rows: insertPayload.total_rows,
    });

    logStageEvent('import_jobs.insert.payload', {
      payload: insertPayloadRecord,
      auth_uid: authUid,
      app_role: role,
      db_current_user_role: dbRole,
    });

    const { data: job, error: jobErr } = await supabase
      .from('import_jobs')
      .insert(insertPayload)
      .select('id,status,total_rows,uploaded_by,file_name,file_type')
      .single();

    logStageEvent('import_jobs.insert.response', {
      job,
      error: jobErr,
      serialized_error: snapshotPostgrestError(jobErr),
    });

    if (jobErr || !job?.id) {
      return fail(
        {
          ...baseDiag(),
          phase: 'job_insert',
          auth_uid: authUid,
          app_role: role,
          db_current_user_role: dbRole,
          db_role_rpc_error: snapshotPostgrestError(dbRoleErr),
          insert_job_payload: insertPayloadRecord,
          inserted_job: null,
          job_insert_error: snapshotPostgrestError(jobErr),
        },
        friendlyStageMessage(jobErr?.message, 'job_insert'),
        jobErr?.message,
      );
    }

    const jobId = job.id as string;
    logStageEvent('import_jobs.insert.success', {
      inserted_job_id: jobId,
      job,
    });

    for (let i = 0; i < payload.rows.length; i += INSERT_CHUNK) {
      const slice = payload.rows.slice(i, i + INSERT_CHUNK);
      const { rows } = buildRowInsertBatch(jobId, slice, i);

      const { data: rowData, error: insErr } = await supabase.from('import_rows').insert(rows).select('id');

      logStageEvent('import_rows.insert.response', {
        jobId,
        fromRowNumber: rows[0]?.row_number,
        toRowNumber: rows.at(-1)?.row_number,
        rowCount: rows.length,
        returned_count: rowData?.length ?? 0,
        error: insErr,
        serialized_error: snapshotPostgrestError(insErr),
      });

      if (insErr) {
        logStageError('import_rows.insert.failed', {
          jobId,
          failing_rows_sample: summarizeRowChunkForDiag(rows),
          serialized_error: snapshotPostgrestError(insErr),
        });
        await supabase.from('import_jobs').delete().eq('id', jobId);
        return fail(
          {
            ...baseDiag(),
            phase: 'rows_insert',
            auth_uid: authUid,
            app_role: role,
            db_current_user_role: dbRole,
            db_role_rpc_error: snapshotPostgrestError(dbRoleErr),
            insert_job_payload: insertPayloadRecord,
            inserted_job: {
              id: jobId,
              status: job.status,
              total_rows: job.total_rows,
              uploaded_by: job.uploaded_by as string | undefined,
            },
            job_insert_error: null,
            rows_insert_error: snapshotPostgrestError(insErr),
            rows_chunk: {
              from_row: rows[0]?.row_number ?? i + 1,
              to_row: rows.at(-1)?.row_number ?? i + rows.length,
              count: rows.length,
            },
            failing_rows_sample: summarizeRowChunkForDiag(rows),
          },
          friendlyStageMessage(insErr.message, 'rows_insert'),
          insErr.message,
        );
      }
    }

    const { error: statErr } = await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });
    logStageEvent('import_jobs_recompute_row_statistics.response', {
      jobId,
      error: statErr,
      serialized_error: snapshotPostgrestError(statErr),
    });
    if (statErr) {
      return fail(
        {
          ...baseDiag(),
          phase: 'stats',
          auth_uid: authUid,
          app_role: role,
          db_current_user_role: dbRole,
          db_role_rpc_error: snapshotPostgrestError(dbRoleErr),
          insert_job_payload: insertPayloadRecord,
          inserted_job: { id: jobId },
          stats_error: snapshotPostgrestError(statErr),
        },
        friendlyStageMessage(statErr.message, 'stats'),
        statErr.message,
      );
    }

    await supabase.rpc('import_job_mark_duplicates_within_job', {
      p_job_id: jobId,
      p_from_states: ['valid', 'warning'],
    });
    await supabase.rpc('import_job_mark_duplicates_existing_posts', { p_job_id: jobId });
    await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

    const { error: finErr } = await supabase.from('import_jobs').update({ status: 'staged' }).eq('id', jobId);
    logStageEvent('import_jobs.finalize_update.response', {
      jobId,
      error: finErr,
      serialized_error: snapshotPostgrestError(finErr),
    });
    if (finErr) {
      return fail(
        {
          ...baseDiag(),
          phase: 'finalize',
          auth_uid: authUid,
          app_role: role,
          db_current_user_role: dbRole,
          db_role_rpc_error: snapshotPostgrestError(dbRoleErr),
          insert_job_payload: insertPayloadRecord,
          inserted_job: { id: jobId },
          finalize_error: snapshotPostgrestError(finErr),
        },
        friendlyStageMessage(finErr.message, 'finalize'),
        finErr.message,
      );
    }

    const success: StageImportJobSuccess = { ok: true, jobId, stagedRows: totalRows, totalRows };
    logStageEvent('staging.complete', { jobId, stagedRows: totalRows });
    return success;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    logStageError('staging.unexpected', { message: msg, stack });
    return fail(
      {
        ...baseDiag(),
        phase: 'unexpected',
        auth_uid: '',
        app_role: '',
        unexpected_message: msg,
      },
      'Import staging failed due to an unexpected server error. Check server logs for [imports:stage].',
      msg,
    );
  }
}
