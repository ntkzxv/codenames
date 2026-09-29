export type Team = "red" | "blue";
export type Role = Team | "neutral" | "assassin";
export type PublicCard = {
  word: string;
  revealed: boolean;
  revealedRole: Role | null;
};
export type GameStatus = "lobby" | "playing" | "red-won" | "blue-won" | "assassin";
export type PublicGame = {
  hostUid: string;
  members: Record<string, boolean>;
  phase: "lobby" | "playing";
  cards: PublicCard[];
  startingTeam: Team | null;
  turn: Team | null;
  status: GameStatus;
};

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function otherTeam(team: Team): Team {
  return team === "red" ? "blue" : "red";
}

export function teamName(team: Team) {
  return team === "red" ? "ทีมแดง" : "ทีมน้ำเงิน";
}
