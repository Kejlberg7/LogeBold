/** Klient til football-data.org v4. Gratis niveau: Premier League, 10 kald i minuttet. */

const BASE = "https://api.football-data.org/v4";

export type ApiTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
};

export type ApiMatch = {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "AWARDED"
    | "POSTPONED"
    | "SUSPENDED"
    | "CANCELLED";
  matchday: number | null;
  homeTeam: ApiTeam;
  awayTeam: ApiTeam;
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
  };
};

export class FootballDataError extends Error {}

async function request<T>(path: string): Promise<T> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    throw new FootballDataError(
      "FOOTBALL_DATA_TOKEN mangler. Hent en gratis nøgle på football-data.org.",
    );
  }

  const response = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new FootballDataError("Grænsen på 10 kald i minuttet er nået. Prøv igen om lidt.");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new FootballDataError(
      `football-data.org svarede ${response.status}. ${body.slice(0, 200)}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchTeams(
  competition: string,
  season: number,
): Promise<ApiTeam[]> {
  const data = await request<{ teams: ApiTeam[] }>(
    `/competitions/${competition}/teams?season=${season}`,
  );
  return data.teams;
}

export async function fetchMatches(
  competition: string,
  season: number,
): Promise<ApiMatch[]> {
  const data = await request<{ matches: ApiMatch[] }>(
    `/competitions/${competition}/matches?season=${season}`,
  );
  return data.matches;
}
