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
  ho_defense: number;        // 何仔防線 (初始 60/100)
  controlled_streets: number;// 轄下街區 (初始 3)
  gang_funds: number;        // 門派流動金 (文)
  xiliang_suspicion: number; // 西涼猜忌度 (0-100)
  monk_evidence: number;     // 僧臣罪證度 (0-100)
  
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
  companion: '何仔（在場·防線 60/60）',

  ho_defense: 60,
  controlled_streets: 3,
  gang_funds: 50,
  xiliang_suspicion: 10,
  monk_evidence: 10,
  combat_rounds: 0,
  in_respite: false,
  debug_mode: false,
};

export const INITIAL_ACTIONS: string[] = [
  'A. [城西街童扒手] 氣血40 | 鐵短錐(15) | 微波零步5%',
  'B. [濕鳩武館棄徒] 氣血55 | 爛鐵條(20) | 斷橋沉肘5%',
  'C. [爛賭收數佬] 氣血45 | 碎肉剪(10) | 淋紅油5%',
  'D. [黑市醫生助手] 氣血42 | 放血薄刃(12) | 分筋挑骨5%',
  'E. [自定義江湖人] 自訂稱號、背景與破爛物資',
];