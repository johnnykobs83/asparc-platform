import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { db } from '../db';
import type { StaffMember } from '../db/types';
import { getMyWeek } from './service';
import { isYmd, mondayOf } from './time';
import { melbourneDate } from '../time/melbourne';

/**
 * A read-only link to one person's weekly schedule, for them to share (with family,
 * another employer, a club). It shows published weeks only, and only what's needed
 * to know where they are: times, job titles and venues. Access notes (gate codes),
 * job notes, colleagues and clients are never shown.
 *
 * The link is signed with the person's calendar secret, so "Make a new calendar
 * link" in Staff & places also stops every shared link working.
 */

const sig = (staff: Pick<StaffMember, 'id' | 'calendar_token'>) =>
  createHmac('sha256', `schedule-share:${env.sessionSecret}`).update(`${staff.id}|${staff.calendar_token}`).digest('base64url').slice(0, 32);

export const shareToken = (staff: Pick<StaffMember, 'id' | 'calendar_token'>) => `${staff.id}.${sig(staff)}`;
export const shareUrl = (staff: Pick<StaffMember, 'id' | 'calendar_token'>, week?: string) => `${env.siteUrl}/schedule/${shareToken(staff)}${week ? `?week=${week}` : ''}`;

export async function staffForShare(token: string): Promise<StaffMember | null> {
  const [id, given] = token.split('.');
  if (!id || !given || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const staff = await db().get('staff_members', id).catch(() => null);
  if (!staff || !staff.active) return null;
  const want = Buffer.from(sig(staff));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got) ? staff : null;
}

export interface SharedWeek {
  name: string;
  role_title: string | null;
  week_start: string;
  days: string[];
  published: boolean;
  jobs: { id: string; date: string; start: number; end: number; title: string; place: string | null; address: string | null; colour: string | null; covering: boolean }[];
}

export async function sharedWeek(staff: StaffMember, weekParam: string | null): Promise<SharedWeek> {
  const week = weekParam && isYmd(weekParam) ? mondayOf(weekParam) : mondayOf(melbourneDate());
  const w = await getMyWeek(staff.id, week);
  const published = Boolean(w.published_at);
  return {
    name: staff.full_name,
    role_title: staff.role_title,
    week_start: w.week_start,
    days: w.days,
    published,
    // Drafts may still change, so a shared link only ever shows weeks that have been sent out.
    jobs: published
      ? w.jobs.map((j) => {
          const l = w.locations.find((x) => x.id === j.location_id);
          return {
            id: j.id,
            date: j.date,
            start: j.start_minutes,
            end: j.end_minutes,
            title: j.title,
            place: l?.name ?? null,
            address: l?.address ?? null,
            colour: l?.colour ?? null,
            covering: j.assignments.some((a) => a.staff_id === staff.id && a.covering_for_staff_id),
          };
        })
      : [],
  };
}
