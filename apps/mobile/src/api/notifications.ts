import type { NotificationPage } from '@butika/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export function useNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  return useInfiniteQuery({
    queryKey: ['notifications', userId, 'list'],
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<NotificationPage>(
      `/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
    ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useUnreadNotificationCount() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['notifications', userId, 'unread-count'],
    enabled: !!userId,
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
  });
}

export function useReadNotification() {
  const client = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications', userId] }),
  });
}
