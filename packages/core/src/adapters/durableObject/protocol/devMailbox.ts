/**
 * A mail the development inbox transport "sent": stored in the state
 * object instead of leaving the machine (design.md D-07).
 */
export type DevMailInput = Readonly<{
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  sentAt: Date;
}>;

export type DevMailRecord = DevMailInput;

export type DevMailQuery = Readonly<{
  /** Only mails to this address (compared as stored, lowercase). */
  to?: string | undefined;
  limit: number;
}>;
