'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Role = 'admin' | 'editor' | 'viewer' | null;

export function useRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();

        if (!userRes?.user) {
          setRole(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', userRes.user.id)
          .single();

        if (error) {
          setError(error.message);
        } else {
          setRole(data?.role as Role);
        }
      } catch {
        setError('Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, []);

  return { role, loading, error };
}