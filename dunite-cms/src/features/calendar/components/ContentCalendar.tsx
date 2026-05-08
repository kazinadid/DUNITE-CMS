'use client';

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

import { useMemo } from 'react';

import type { Post } from '@/features/posts';

import { CalendarPlannerEvent } from '@/features/calendar/components/CalendarPlannerEvent';
import { paintFcEventElement } from '@/features/calendar/lib/paintFcEvent';
import { postToEventInput } from '@/features/calendar/lib/toCalendarEvents';

interface ContentCalendarProps {
  posts:      Post[];
  allowDrag:  boolean;
  onDatesSet: (start: Date, end: Date) => void;
  onOpenPost: (post: Post) => void;
  onReschedulePost: (post: Post, newStart: Date) => Promise<void>;
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

  return (
    <div className="fc-calendar-shell min-h-[min(520px,70vh)] overflow-hidden rounded-[1.125rem] border border-border/75 bg-muted/35 shadow-[0_24px_64px_-32px_rgba(15,23,42,0.25),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[2px] md:min-h-[calc(100vh-15rem)] [&_.fc-toolbar]:sticky [&_.fc-toolbar]:top-0 [&_.fc-toolbar]:z-30 [&_.fc-toolbar]:mb-3 [&_.fc-toolbar]:rounded-xl [&_.fc-toolbar]:border [&_.fc-toolbar]:border-border/60 [&_.fc-toolbar]:bg-card/94 [&_.fc-toolbar]:px-2 [&_.fc-toolbar]:py-2 [&_.fc-toolbar]:shadow-sm [&_.fc-toolbar]:backdrop-blur-md [&_.fc-view-harness]:min-h-[320px] md:[&_.fc-view-harness]:min-h-[480px]">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
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
          const start = info.event.start;
          if (!start) return;
          void onReschedulePost(post, start).catch(() => {
            info.revert();
          });
        }}
      />
    </div>
  );
}
