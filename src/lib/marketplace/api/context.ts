import type { Db } from "mongodb";
import type { Session } from "next-auth";

export type Body = Record<string, unknown>;
export type AuthedSession = Session & { user: { id: string } };
export type ApiContext = { request: Request; session: AuthedSession; userId: string; path: string[]; db: Db };
export type WriteContext = ApiContext & { body: Body; now: Date };
export type Handler<C> = (ctx: C) => Promise<Response | null>;
