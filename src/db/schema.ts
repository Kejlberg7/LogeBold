import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Alle beløb gemmes i øre (heltal), aldrig som kommatal.
 * Fortegn i posteringer: positivt = medlemmet skylder, negativt = kredit.
 */

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  competitionCode: text("competition_code").notNull().default("PL"),
  apiSeasonYear: integer("api_season_year").notNull(),
  drawFeeOre: integer("draw_fee_ore").notNull().default(2500),
  lossFeeOre: integer("loss_fee_ore").notNull().default(5000),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  apiId: integer("api_id").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  tla: text("tla"),
  crestUrl: text("crest_url"),
});

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  loginCode: text("login_code").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
  },
  (t) => [
    // Flere medlemmer kan trække det samme hold, så holdet er ikke unikt i sig selv.
    uniqueIndex("assignments_season_member_team_uq").on(t.seasonId, t.memberId, t.teamId),
    index("assignments_season_team_idx").on(t.seasonId, t.teamId),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    apiId: integer("api_id").notNull().unique(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    matchday: integer("matchday"),
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    homeTeamId: integer("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer("away_team_id")
      .notNull()
      .references(() => teams.id),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    /**
     * Måneden kampen som udgangspunkt opkræves i, "YYYY-MM". Regnes ud af
     * computeBillingDefaults i sync.ts og skrives ved hver synkronisering,
     * så udsatte kampe flytter med.
     */
    billingMonthDefault: text("billing_month_default"),
    /** Admins manuelle valg. Vinder altid over standarden ovenfor. */
    billingMonthOverride: text("billing_month_override"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [index("matches_season_matchday_idx").on(t.seasonId, t.matchday)],
);

export const entryTypeEnum = pgEnum("entry_type", [
  "match",
  "fine",
  "payment",
  "adjustment",
]);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    type: entryTypeEnum("type").notNull(),
    amountOre: integer("amount_ore").notNull(),
    /** Bruges til at placere posteringen i den rigtige måned (dansk tid). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /**
     * Måneden posteringen opkræves i, "YYYY-MM". Er den tom, falder vi tilbage
     * til occurredAt — sådan læses gamle posteringer fra før feltet fandtes.
     */
    billingMonth: text("billing_month"),
    description: text("description").notNull(),
    matchId: integer("match_id").references(() => matches.id, { onDelete: "cascade" }),
    teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method"),
    note: text("note"),
    createdByMemberId: integer("created_by_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    /** Modpostering: peger på den postering der annulleres. */
    reversesEntryId: integer("reverses_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Én kampopkrævning pr. medlem pr. hold pr. kamp — gør synkronisering idempotent,
    // og tillader at flere medlemmer betaler for det samme hold.
    uniqueIndex("ledger_match_team_member_uq")
      .on(t.matchId, t.teamId, t.memberId)
      .where(sql`${t.type} = 'match'`),
    index("ledger_season_member_idx").on(t.seasonId, t.memberId),
    index("ledger_billing_month_idx").on(t.seasonId, t.billingMonth),
    index("ledger_occurred_idx").on(t.occurredAt),
  ],
);

export const fineTypes = pgTable("fine_types", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultAmountOre: integer("default_amount_ore").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const monthLocks = pgTable(
  "month_locks",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Formatet "2026-09". */
    monthKey: text("month_key").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    lockedByMemberId: integer("locked_by_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("month_locks_season_month_uq").on(t.seasonId, t.monthKey)],
);

/** Udbetalinger fra potten (præmie, fest, indkøb). */
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  amountOre: integer("amount_ore").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  createdByMemberId: integer("created_by_member_id").references(() => members.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  trigger: text("trigger").notNull(),
  matchesUpserted: integer("matches_upserted").notNull().default(0),
  entriesCreated: integer("entries_created").notNull().default(0),
  error: text("error"),
});
