export interface PlayerState {
  identity: string;
  copper: number;
  silver: number;
  qi_hp: number;
  max_qi_hp: number;
  neili: number;
  max_neili: number;
  wit_points: number;
  weapon: string;
  inventory: string[];
  companion: string;

  // 門派與同伴隱藏數值
  sect_lifeline: number;        // 青鋒堂命脈 (初始 60/100)
  controlled_streets: number;// 轄下街區 (初始 3)
  gang_funds: number;        // 門派流動金 (文)
  xiliang_suspicion: number; // 燕鎮嶽猜忌度 (0-100)
  monk_evidence: number;     // 玄渡罪證度 (0-100)
  
  // 節奏控制
  combat_rounds: number;     // 當前戰鬥輪數 (封頂 3-4 回合)
  in_respite: boolean;       // 是否處於安全喘息期
  debug_mode: boolean;       // 是否處於除錯模式
}

export interface ChatMessage {
  role: 'player' | 'gm';
  content: string;
  actions?: string[];
}

export const INITIAL_PLAYER_STATE: PlayerState = {
  identity: '未定（請選擇出身）',
  copper: 0,
  silver: 0,
  qi_hp: 0,
  max_qi_hp: 0,
  neili: 0,
  max_neili: 0,
  wit_points: 2,
  weapon: '徒手',
  inventory: ['', '', '', ''],
  companion: '何不歸（在場·防線 60/60）',

  sect_lifeline: 60,
  controlled_streets: 3,
  gang_funds: 50,
  xiliang_suspicion: 10,
  monk_evidence: 10,
  combat_rounds: 0,
  in_respite: false,
  debug_mode: false,
};

export const INITIAL_ACTIONS: string[] = [
  'A. [城西街童扒手] 從黑泥街的攤隙中長大。',
  'B. [落魄武館棄徒] 拳路未忘，舊傷難平。',
  'C. [賭坊收帳人] 認得借據，也認得人心。',
  'D. [黑市醫道學徒] 藥味與血色，從不認錯。',
  'E. [自定義市井流民] 自行寫下來歷與本事。',
];
