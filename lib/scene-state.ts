import type { Landmark } from "./game-engine.ts";

export type SceneObject = {
  name: string;
  position: string;
  access: string;
  use: string;
  hidden?: boolean;
};

export type ObjectRule = {
  visibility: "visible" | "hidden";
  reach: "near" | "move" | "guarded";
  handling: "take" | "heavy" | "fixed" | "unknown";
  holder?: string;
};

// Visibility, distance, control and possession are separate facts. The prose above
// explains the price of changing any of them; it does not grant instant possession.
export const OBJECT_RULES: Record<string, ObjectRule> = {
  "堂口兵器架": { visibility: "visible", reach: "near", handling: "heavy" },
  "牛肉刀": { visibility: "visible", reach: "near", handling: "take" },
  "青銅燭台": { visibility: "visible", reach: "move", handling: "take" },
  "太師椅": { visibility: "visible", reach: "near", handling: "heavy" },
  "儀式用青鋒劍": { visibility: "visible", reach: "move", handling: "fixed" },
  "落地銅香爐": { visibility: "visible", reach: "near", handling: "heavy" },
  "梁下堂號大布幔": { visibility: "visible", reach: "move", handling: "fixed" },
  "公款鐵皮木箱": { visibility: "visible", reach: "near", handling: "fixed" },
  "沸水大銅壺": { visibility: "visible", reach: "near", handling: "take" },
  "缺腳長木凳": { visibility: "visible", reach: "near", handling: "take" },
  "茶渣爛泥": { visibility: "visible", reach: "near", handling: "take" },
  "竹篾遮陽頂篷繫繩": { visibility: "visible", reach: "near", handling: "fixed" },
  "土灶生鐵通條": { visibility: "visible", reach: "near", handling: "take" },
  "粗陶大茶碗疊堆": { visibility: "visible", reach: "near", handling: "take" },
  "剁骨刀": { visibility: "visible", reach: "guarded", handling: "take", holder: "張斷骨" },
  "懸肉鐵鉤": { visibility: "visible", reach: "near", handling: "take" },
  "厚砧板": { visibility: "visible", reach: "near", handling: "heavy" },
  "廢竹籮": { visibility: "visible", reach: "move", handling: "take" },
  "餿水桶": { visibility: "visible", reach: "move", handling: "heavy" },
  "半扇懸掛生豬胴體": { visibility: "visible", reach: "near", handling: "heavy" },
  "排污水溝爛木蓋板": { visibility: "visible", reach: "near", handling: "heavy" },
  "銅錢與骨骰": { visibility: "visible", reach: "near", handling: "take" },
  "賭桌": { visibility: "visible", reach: "near", handling: "heavy" },
  "懸頂油燈": { visibility: "visible", reach: "move", handling: "fixed" },
  "烈質燒酒大酒罈": { visibility: "visible", reach: "near", handling: "heavy" },
  "守場打手短木梃": { visibility: "visible", reach: "guarded", handling: "take", holder: "守場打手" },
  "粗麻圍繩": { visibility: "visible", reach: "near", handling: "fixed" },
  "血浸粗沙": { visibility: "visible", reach: "near", handling: "take" },
  "角柱鐵箍木樁": { visibility: "visible", reach: "near", handling: "fixed" },
  "看客拋擲碎瓦瓦礫": { visibility: "visible", reach: "near", handling: "take" },
  "擂台升降木梯木栓": { visibility: "visible", reach: "near", handling: "fixed" },
  "無名藥粉瓷瓶": { visibility: "visible", reach: "guarded", handling: "unknown", holder: "顧忘生" },
  "炭爐": { visibility: "visible", reach: "near", handling: "heavy" },
  "泡蛇藥酒罈": { visibility: "visible", reach: "move", handling: "heavy" },
  "曬乾辛辣藥草捆": { visibility: "visible", reach: "near", handling: "take" },
  "研藥硬石臼與石杵": { visibility: "visible", reach: "near", handling: "heavy" },
  "半拉布簾厚棉被": { visibility: "visible", reach: "near", handling: "heavy" },
  "銅鏡": { visibility: "visible", reach: "move", handling: "take" },
  "瓷罐與胭脂": { visibility: "visible", reach: "move", handling: "take" },
  "床幔絛帶": { visibility: "visible", reach: "move", handling: "take" },
  "雕花硬木酒几": { visibility: "visible", reach: "move", handling: "heavy" },
  "二樓雕花外廊窗櫺": { visibility: "visible", reach: "move", handling: "fixed" },
  "名伶琵琶殘琴": { visibility: "visible", reach: "move", handling: "take" },
  "濕貨箱": { visibility: "visible", reach: "near", handling: "heavy" },
  "纜繩與鐵錨": { visibility: "visible", reach: "move", handling: "fixed" },
  "生鏽魚網": { visibility: "visible", reach: "move", handling: "take" },
  "滑膩運魚木桶與死魚": { visibility: "visible", reach: "near", handling: "heavy" },
  "防撞浸水麻包堆": { visibility: "visible", reach: "move", handling: "heavy" },
};

export type LandmarkScene = {
  routes: string;
  conditions: string;
  objects: readonly SceneObject[];
  entrance?: { position: string; access: string };
};

// Fixed geography. A visit's people, ownership and spent objects live in SceneState.
export const LANDMARK_SCENES: Record<Landmark, LandmarkScene> = {
  "青鋒堂總壇": {
    routes: "正門通街，後門暗巷通城西貧民窟；正堂空曠。",
    conditions: "正堂兩側兵器架備有刀、劍、棍與長槍，供堂口守衛和出勤門生使用；須經堂主允許領取。堂主坐在案前時，異常舉動會引來盤問；兩名持刀幫眾守正門。",
    objects: [
      { name: "堂口兵器架", position: "正堂兩側及何不歸案後", access: "木架沉重，挪動費力；領兵器須得堂主允許", use: "存放刀、劍、棍與長槍" },
      { name: "牛肉刀", position: "何不歸案後的兵器架", access: "有存貨；出勤門生須向堂主借取", use: "常規鐵器兵刃，刀口與耐久有限" },
      { name: "青銅燭台", position: "何不歸手邊案上", access: "須逼近案前三步，會招致反擊", use: "點火或砸人" },
      { name: "太師椅", position: "正堂兩側", access: "可踢翻，難以投擲", use: "阻路或絆倒敵人" },
      { name: "儀式用青鋒劍", position: "高牆牌匾下", access: "懸於高處，須踏椅攀取；未開刃", use: "難作實戰兵刃，硬取可作鈍器" },
      { name: "落地銅香爐", position: "正堂供桌前", access: "沉重且爐灰燙熱，踹翻會傷及近旁的人", use: "傾倒爐身阻路，香灰與煙可嗆目" },
      { name: "梁下堂號大布幔", position: "正門梁下", access: "須先靠近，再以利刃割斷繫繩", use: "布幔墜落可擾亂門前多人，未必困住對手" },
      { name: "公款鐵皮木箱", position: "堂主案側", access: "上鎖；強劈會損刀刃並發出巨響，堂主會阻止擅取", use: "存放堂口公款，不可憑空取出銀兩" },
    ],
  },
  "晚秋茶寮": {
    routes: "三面透風的街角茶棚背靠高牆，明路易走，難以固守。",
    conditions: "白日動手會招人圍觀；容晚秋守著櫃檯。",
    entrance: { position: "煮茶土灶底的空心石板", access: "先得知入口，再趁土灶無人看守時移開石板" },
    objects: [
      { name: "沸水大銅壺", position: "滾水土灶上", access: "伸手可取，會燙傷手掌", use: "潑水燙敵或擋路，也會傷及近身的人" },
      { name: "缺腳長木凳", position: "茶棚外側", access: "可隨手拿起，擋刀易碎", use: "鈍器或路障" },
      { name: "茶渣爛泥", position: "茶棚地面", access: "須俯身抓取，貼身易被搶攻", use: "撒眼或弄滑腳下地面" },
      { name: "竹篾遮陽頂篷繫繩", position: "茶棚柱旁", access: "須近柱割繩；篷頂浸雨後沉重，亦可能砸中自己人", use: "割斷後令局部頂篷塌下，擾亂棚內身位" },
      { name: "土灶生鐵通條", position: "土灶炭灰中", access: "可抽出，前端微燙易灼手", use: "短鐵尺般刺擊或撥炭" },
      { name: "粗陶大茶碗疊堆", position: "櫃檯邊", access: "隨手可抓，擲出後會碎裂", use: "投擲擾敵，碎片留在地上妨礙步伐" },
    ],
  },
  "黑泥街": {
    routes: "張斷骨肉檔在十字街角；後巷極窄且是死胡同，巷尾可借竹籮與餿水桶攀牆。",
    conditions: "地面油滑泥濘；肉檔與巷口的夾角容易被包抄。",
    objects: [
      { name: "剁骨刀", position: "張斷骨手上或肉案上，以當前人物狀態為準", access: "在他手上須先奪刀；不得隔空取得", use: "近身砍擊" },
      { name: "懸肉鐵鉤", position: "肉檔木架", access: "須靠近抬手扯下，可能劃傷手掌", use: "拉扯或傷敵" },
      { name: "厚砧板", position: "肉案上", access: "沉重，須合力掀動", use: "推撞路障" },
      { name: "廢竹籮", position: "死胡同盡頭", access: "須先退入巷尾", use: "路障或攀牆踏腳" },
      { name: "餿水桶", position: "死胡同盡頭", access: "須先退入巷尾", use: "推倒阻路或攀牆踏腳" },
      { name: "半扇懸掛生豬胴體", position: "張斷骨肉檔木架下", access: "沉重，須靠近大力推動；擺盪也可能撞到自己", use: "晃動可撞亂身位，或暫作遮擋" },
      { name: "排污水溝爛木蓋板", position: "肉檔外側水溝上", access: "須走到溝邊才可掀開或移動", use: "露出水溝，可能令奔跑者踩空扭傷" },
    ],
  },
  "鬼骰坊": {
    routes: "入口是地下階梯；賭桌塞滿窄廳，賬房在後方。",
    conditions: "地下通風差，火與毒煙會反噬；打手守樓梯，長兵器難帶入。",
    entrance: { position: "賬房後雜物堆下的鐵柵活門", access: "先進賬房、移開重物，再用鑰匙或工具開門" },
    objects: [
      { name: "銅錢與骨骰", position: "賭桌上", access: "走近賭桌可抓取", use: "擲擊擾敵，不能致命" },
      { name: "賭桌", position: "窄廳", access: "須費力掀翻", use: "掩體或路障" },
      { name: "懸頂油燈", position: "木樑上", access: "須以投擲物擊落", use: "引火，亦會危及自己" },
      { name: "烈質燒酒大酒罈", position: "窄廳牆邊", access: "罈身沉重，砸碎會使地面濕滑", use: "遇明火可燃；地庫起火會殃及所有人" },
      { name: "守場打手短木梃", position: "守場打手腰間", access: "須先制服打手或令其失衡，不能隔空奪取", use: "短鈍器，可擊打或格擋" },
    ],
  },
  "裂石擂": {
    routes: "擂台在中央，兩側木階可上下；觀眾與鐵網圍住四面。",
    conditions: "觀眾擁擠，逃離須先擠出人群；旁人通常不會介入台上勝負。",
    objects: [
      { name: "粗麻圍繩", position: "擂台邊", access: "靠近邊緣可抓住", use: "借力或纏縛" },
      { name: "血浸粗沙", position: "擂台地面", access: "俯身可抓取，揚距短", use: "撒眼；血濕處易滑" },
      { name: "角柱鐵箍木樁", position: "擂台四角", access: "固定不可搬動", use: "借衝力撞擊對手" },
      { name: "看客拋擲碎瓦瓦礫", position: "擂台邊", access: "散落台邊，靠近才可拾取", use: "投擲擾敵，可能迫使對手收招" },
      { name: "擂台升降木梯木栓", position: "擂台兩側木階接點", access: "須靠近並拔除木栓，動作會暴露身位", use: "破壞梯架可阻滯台下的人登台" },
    ],
  },
  "苦煙館": {
    routes: "前舖後居，前門臨街；後院翻牆通後巷。",
    conditions: "走廊藥煙遮眼，久留傷神；顧忘生不信任生面孔。",
    objects: [
      { name: "無名藥粉瓷瓶", position: "櫃檯後排架", access: "須接近或獲顧忘生允許；藥性未辨不能預知", use: "固定藥性，盲用有中毒風險" },
      { name: "炭爐", position: "夾道腳邊", access: "靠近可踢翻，炭火會灼傷衣物", use: "阻路生煙" },
      { name: "泡蛇藥酒罈", position: "後舖", access: "重逾三十斤，搬動緩慢", use: "砸碎後須明火才可助燃" },
      { name: "曬乾辛辣藥草捆", position: "前舖懸架", access: "可扯下，投炭爐須靠近明火", use: "燃燒生嗆煙，也會刺激自己與顧忘生" },
      { name: "研藥硬石臼與石杵", position: "研藥案上", access: "石杵可取；石臼沉重，只能推落或慢慢搬動", use: "石杵可作短鈍器，石臼可砸腳或堵路" },
      { name: "半拉布簾厚棉被", position: "後舖門邊", access: "棉被沉重，須浸水後才較能隔煙", use: "暫掩口鼻或纏裹刀刃，效果視煙量與距離而定" },
    ],
  },
  "夜雨樓": {
    routes: "三層樓有曲折迴廊；正門臨街，後門通小巷，二樓窗可至鄰屋頂。",
    conditions: "動武會招官府注意；上二樓須熟人帶路或付錢。",
    entrance: { position: "後院酒窖最深處的廢棄巨桶內", access: "先進酒窖並避開護院，再開桶內暗門" },
    objects: [
      { name: "銅鏡", position: "房內梳妝檯", access: "須進房才可取", use: "反光或鈍擊；銅鏡不會碎成玻璃刃" },
      { name: "瓷罐與胭脂", position: "房內几案", access: "須進房才可取", use: "瓷片割手或揚粉迷目" },
      { name: "床幔絛帶", position: "房內床沿", access: "須進房才可扯下", use: "纏刀、縛腕；不足以吊人" },
      { name: "雕花硬木酒几", position: "二樓房內", access: "須進房，掀翻時會發出聲響", use: "橫置可擋暗器或阻路，未必擋住重擊" },
      { name: "二樓雕花外廊窗櫺", position: "二樓外廊", access: "須先上二樓；撞破窗櫺會受傷並引人注意", use: "可翻往一樓篷頂逃生，跌落仍有受傷風險" },
      { name: "名伶琵琶殘琴", position: "二樓房內", access: "須先進房，琴身脆弱易碎", use: "可砸擊擾敵；琴弦可拆下，但難在交手中即時使用" },
    ],
  },
  "碼頭": {
    routes: "一面臨水，貨箱圍住三面；棧橋窄，退路有限。",
    conditions: "夜風妨礙火攻並掩蓋腳步；跳水會受傷，重物難保。",
    objects: [
      { name: "濕貨箱", position: "棧道側", access: "須靠近費力推倒", use: "掩體或截路" },
      { name: "纜繩與鐵錨", position: "船邊", access: "纜繩繃緊須利刃割；鐵錨不可投擲", use: "絆索或牽制" },
      { name: "生鏽魚網", position: "木架上", access: "可扯下，倒鉤也會掛住自己", use: "裹住一人" },
      { name: "滑膩運魚木桶與死魚", position: "窄棧道側", access: "踢翻會讓自己和追兵都難站穩", use: "魚與內臟弄滑木板，奔跑者可能失足落水" },
      { name: "防撞浸水麻包堆", position: "石壁外側", access: "浸水沉重，須靠近才可移動", use: "可作死角掩體，能擋部分刀劍攻勢" },
    ],
  },
};

export const PASSAGE_ENTRANCES = ["晚秋茶寮", "鬼骰坊", "夜雨樓"] as const;
export type PassageEntrance = typeof PASSAGE_ENTRANCES[number];
export type SceneState = {
  discoveredEntrances: PassageEntrance[];
  openedEntrances: PassageEntrance[];
  depletedSources: string[];
  movedObjects: Record<string, string>;
  objectHolders: Record<string, string>;
  medicineIdentified: boolean;
  medicineUsed: boolean;
  medicineKind: "散氣粉";
};

export function normalizeSceneState(raw: unknown, legacyFlags: readonly string[] = []): SceneState {
  const value = raw && typeof raw === "object" ? raw as Partial<SceneState> : {};
  const known = Array.isArray(value.discoveredEntrances) ? value.discoveredEntrances : [];
  const discoveredEntrances = PASSAGE_ENTRANCES.filter((place) => known.includes(place)
    || (legacyFlags.includes("茶寮暗道已知") && (place === "晚秋茶寮" || place === "夜雨樓")));
  const rawOpened = Array.isArray(value.openedEntrances) ? value.openedEntrances : [];
  const openedEntrances = PASSAGE_ENTRANCES.filter((place) => discoveredEntrances.includes(place)
    && (rawOpened.includes(place) || (value.openedEntrances === undefined && legacyFlags.includes("茶寮暗道已知")
      && (place === "晚秋茶寮" || place === "夜雨樓"))));
  const depletedSources = Array.isArray(value.depletedSources)
    ? value.depletedSources.filter((source): source is string => typeof source === "string").slice(0, 30) : [];
  const movedObjects = value.movedObjects && typeof value.movedObjects === "object"
    ? Object.fromEntries(Object.entries(value.movedObjects).filter(([key, position]) =>
      typeof key === "string" && typeof position === "string").slice(0, 40)) : {};
  const objectHolders = value.objectHolders && typeof value.objectHolders === "object"
    ? Object.fromEntries(Object.entries(value.objectHolders).filter(([key, holder]) =>
      typeof key === "string" && typeof holder === "string").slice(0, 40)) : {};
  for (const [oldName, newName] of [["堂口備用短刀", "牛肉刀"], ["沸水銅壺", "沸水大銅壺"]]) {
    if (objectHolders[oldName] !== undefined && objectHolders[newName] === undefined)
      objectHolders[newName] = objectHolders[oldName];
    if (movedObjects[oldName] !== undefined && movedObjects[newName] === undefined)
      movedObjects[newName] = movedObjects[oldName];
    delete objectHolders[oldName];
    delete movedObjects[oldName];
  }
  if (legacyFlags.includes("張斷骨失刀") && objectHolders["剁骨刀"] === undefined) {
    objectHolders["剁骨刀"] = "";
    movedObjects["剁骨刀"] ??= "肉案下";
  }
  return { discoveredEntrances, openedEntrances, depletedSources, movedObjects, objectHolders,
    medicineIdentified: value.medicineIdentified === true, medicineUsed: value.medicineUsed === true,
    medicineKind: "散氣粉" };
}

export function objectStatus(scene: SceneState, name: string): ObjectRule | undefined {
  if (name === "無名藥粉瓷瓶" && scene.medicineUsed) return undefined;
  const rule = OBJECT_RULES[name];
  if (!rule) return undefined;
  const droppedButcherKnife = name === "剁骨刀" && scene.objectHolders[name] === "";
  const borrowedKnife = name === "牛肉刀" && scene.objectHolders[name] === "玩家";
  const lostKnife = name === "牛肉刀" && scene.objectHolders[name] === "";
  return { ...rule, reach: borrowedKnife ? "near" : droppedButcherKnife || lostKnife ? "move" : rule.reach,
    holder: scene.objectHolders[name] ?? rule.holder };
}

export function revealEntrance(scene: SceneState, place: PassageEntrance): void {
  if (!scene.discoveredEntrances.includes(place)) scene.discoveredEntrances.push(place);
}

export function openEntrance(scene: SceneState, place: PassageEntrance): void {
  revealEntrance(scene, place);
  if (!scene.openedEntrances.includes(place)) scene.openedEntrances.push(place);
}

export function sceneFacts(place: Landmark, scene: SceneState): string {
  const site = LANDMARK_SCENES[place];
  const objects = site.objects.filter((object) => objectStatus(scene, object.name)?.visibility === "visible")
    .map((object) => { const rule = objectStatus(scene, object.name)!;
      const identity = object.name === "無名藥粉瓷瓶" && scene.medicineIdentified ? `；已辨為${scene.medicineKind}` : "";
      const reach = rule.reach === "near" ? "可及" : rule.reach === "move" ? "可見、未及" : "可見、受人把守";
      const handling = rule.handling === "take" ? "接近後可取" : rule.handling === "heavy" ? "沉重難取"
        : rule.handling === "fixed" ? "固定不可取" : "藥性未知，不能預知效果";
      const access = object.name === "剁骨刀" && !rule.holder && scene.movedObjects[object.name]
        ? "刀已脫手，須靠近所在位置才可拾起"
        : object.name === "牛肉刀" && rule.holder === "玩家" ? "堂主已借出，現由玩家攜帶"
          : object.name === "牛肉刀" && !rule.holder && scene.movedObjects[object.name]
            ? "刀已失落或折斷，不在兵器架上" : object.access;
      return `${object.name}在${scene.movedObjects[object.name] || object.position}；${reach}；${handling}；${rule.holder ? `由${rule.holder}持有；` : ""}${access}；${object.use}${identity}`; }).join("。 ");
  const entrance = site.entrance && scene.discoveredEntrances.includes(place as PassageEntrance)
    ? `${scene.openedEntrances.includes(place as PassageEntrance) ? "已打開" : "已知但未打開"}暗道入口：${site.entrance.position}；${site.entrance.access}。` : "";
  return `${site.routes}${site.conditions}${objects}。${entrance}`;
}
