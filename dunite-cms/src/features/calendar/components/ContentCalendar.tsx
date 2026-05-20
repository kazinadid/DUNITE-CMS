'use client';

import luxon3Plugin from '@fullcalendar/luxon3';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventMountArg,
} from '@fullcalendar/core';

/* FullCalendar v6: base styles are injected at runtime — do not import removed index.css bundles. */

import '@/features/calendar/styles/fullcalendar-dunite.css';

import { useEffect, useMemo } from 'react';

import type { Post } from '@/features/posts';

import { CalendarPlannerEvent } from '@/features/calendar/components/CalendarPlannerEvent';
import { paintFcEventElement } from '@/features/calendar/lib/paintFcEvent';
import { postToEventInput } from '@/features/calendar/lib/toCalendarEvents';
import { fcEventStartToUtcIso } from '@/features/calendar/lib/fcEventStartToUtcIso';
import { postTzDebugIngest } from '@/lib/debug/tzDebugIngestClient';
import { resolveLocalTimeZone } from '@/lib/date';

interface ContentCalendarProps {
  posts:      Post[];
  allowDrag:  boolean;
  onDatesSet: (start: Date, end: Date) => void;
  onOpenPost: (post: Post) => void;
  onReschedulePost: (post: Post, scheduledAtIsoUtc: string) => Promise<void>;
}

export function ContentCalendar({
  posts,
  allowDrag,
  onDatesSet,
  onOpenPost,
  onReschedulePost,
}: ContentCalendarProps) {
  const events = useMemo(
    () =>
      posts
        .filter((p) => Boolean(p.scheduled_at))
        .map((p) => postToEventInput(p, allowDrag)),
    [posts, allowDrag],
  );

  useEffect(() => {
    // #region agent log
    if (typeof window === 'undefined') return;

    let browserTz = 'unknown';

    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
    } catch {
      /* ignore */
    }

    postTzDebugIngest({
      sessionId:      'e436a7',
      hypothesisId: 'FC-MOUNT',
      location:       'ContentCalendar.tsx:mount',
      message:       'desktop FullCalendar subtree mounted',
      data: {
        workspaceTz:   resolveLocalTimeZone(),
        browserTz,
        scheduledCount: posts.filter((p) => Boolean(p.scheduled_at)).length,
        narrowVp:
          typeof window !== 'undefined'
            ? (window.matchMedia?.('(max-width:767px)')?.matches ?? null)
            : null,
      },
      timestamp: Date.now(),
    });
    // #endregion

    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only probe
  }, []);

  return (
    <div className="fc-calendar-shell min-h-[min(520px,70vh)] overflow-hidden rounded-[1.125rem] border border-border/75 bg-muted/35 shadow-[0_24px_64px_-32px_rgba(15,23,42,0.25),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[2px] md:min-h-[calc(100vh-15rem)] [&_.fc-toolbar]:sticky [&_.fc-toolbar]:top-0 [&_.fc-toolbar]:z-30 [&_.fc-toolbar]:mb-3 [&_.fc-toolbar]:rounded-xl [&_.fc-toolbar]:border [&_.fc-toolbar]:border-border/60 [&_.fc-toolbar]:bg-card/94 [&_.fc-toolbar]:px-2 [&_.fc-toolbar]:py-2 [&_.fc-toolbar]:shadow-sm [&_.fc-toolbar]:backdrop-blur-md [&_.fc-view-harness]:min-h-[320px] md:[&_.fc-view-harness]:min-h-[480px]">
      <FullCalendar
        plugins={[luxon3Plugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        timeZone={resolveLocalTimeZone()}
        headerToolbar={{
          left:   'prev,next today',
          center: 'title',
          right:  'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        editable={allowDrag}
        selectable={false}
        dayMaxEvents
        dayMaxEventRows={4}
        nowIndicator
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        slotLabelInterval="01:00:00"
        scrollTime="07:30:00"
        allDaySlot={false}
        height="auto"
        events={events}
        datesSet={(arg: DatesSetArg) => {
          // #region agent log
          if (typeof window !== 'undefined') {
            let browserTz = 'unknown';
            try {
              browserTz =
                Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
            } catch {
              /* ignore */
            }
            postTzDebugIngest({
              sessionId:      'e436a7',
              hypothesisId: 'FC-VIEW',
              location:      'ContentCalendar.tsx:datesSet',
              message:      'FC visible window → drives listCalendarPosts [start,end)',
              data: {
                viewType:     arg.view.type,
                startUtc:     arg.start.toISOString(),
                endUtc:       arg.end.toISOString(),
                workspaceTz:  resolveLocalTimeZone(),
                browserTz,
              },
              timestamp: Date.now(),
            });
          }
          // #endregion
          onDatesSet(arg.start, arg.end);
        }}
        eventDidMount={(info: EventMountArg) => {
          info.el.classList.add('dunite-fc-event-shell');
          paintFcEventElement(info.el);
        }}
        eventDragStart={() => {
          document.documentElement.classList.add('fc-dunite-dragging');
        }}
        eventDragStop={() => {
          document.documentElement.classList.remove('fc-dunite-dragging');
        }}
        eventContent={(arg: EventContentArg) => <CalendarPlannerEvent arg={arg} />}
        eventClick={(info: EventClickArg) => {
          info.jsEvent.preventDefault();
          const post = info.event.extendedProps.post as Post;
          onOpenPost(post);
        }}
        eventDrop={(info: EventDropArg) => {
          const post = info.event.extendedProps.post as Post;
          const tz = resolveLocalTimeZone();
          const { iso, meta } = fcEventStartToUtcIso(
            info.event.startStr,
            info.event.start,
            tz,
          );
          if (!iso) {
            info.revert();
            return;
          }

          // #region agent log
          if (typeof window !== 'undefined') {
            postTzDebugIngest({
              sessionId:      'e436a7',
              hypothesisId: 'FC-DROP',
              location:       'ContentCalendar.tsx:eventDrop',
              message:       'calendar drag reschedule',
              data: {
                iso,
                workspaceTz:  tz,
                fcStartStr:     info.event.startStr,
                parseMeta:      meta,
                postId:         post.id,
                prevScheduled:  post.scheduled_at,
              },
              timestamp: Date.now(),
            });
          }
          // #endregion

          void onReschedulePost(post, iso).catch(() => {
            info.revert();
          });
        }}
      />
    </div>
  );
}
