export type ActionTag = "cautious" | "protective" | "reckless" | "trouble" | "ruthless"
  | "brave" | "cowardly" | "profitable" | "rules" | "generous"
  | "rule-breaking" | "trade" | "violence" | "merciful" | "observant";

export interface Option {
  label: string;
  actionTags?: readonly ActionTag[];
}
