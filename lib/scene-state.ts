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
  "青銅燭台": { visibility: "visible", reach: "guarded", handling: "take", holder: "何不歸" },
  "太師椅": { visibility: "visible", reach: "near", handling: "heavy" },
  "儀式用青鋒劍": { visibility: "visible", reach: "move", handling: "take" },
  "沸水銅壺": { visibility: "visible", reach: "near", handling: "take" },
  "缺腳長木凳": { visibility: "visible", reach: "near", handling: "take" },
  "茶渣爛泥": { visibility: "visible", reach: "near", handling: "take" },
  "剁骨刀": { visibility: "visible", reach: "guarded", handling: "take", holder: "張斷骨" },
  "懸肉鐵鉤": { visibility: "visible", reach: "move", handling: "take" },
  "厚砧板": { visibility: "visible", reach: "move", handling: "heavy" },
  "廢竹籮": { visibility: "visible", reach: "move", handling: "take" },
  "餿水桶": { visibility: "visible", reach: "move", handling: "heavy" },
  "銅錢與骨骰": { visibility: "visible", reach: "near", handling: "take" },
  "賭桌": { visibility: "visible", reach: "near", handling: "heavy" },
  "懸頂油燈": { visibility: "visible", reach: "move", handling: "fixed" },
  "粗麻圍繩": { visibility: "visible", reach: "near", handling: "fixed" },
  "血浸粗沙": { visibility: "visible", reach: "near", handling: "take" },
  "角柱鐵箍木樁": { visibility: "visible", reach: "near", handling: "fixed" },
  "無名藥粉瓷瓶": { visibility: "visible", reach: "guarded", handling: "unknown", holder: "顧忘生" },
  "炭爐": { visibility: "visible", reach: "near", handling: "heavy" },
  "泡蛇藥酒罈": { visibility: "visible", reach: "move", handling: "heavy" },
  "銅鏡": { visibility: "visible", reach: "move", handling: "take" },
  "瓷罐與胭脂": { visibility: "visible", reach: "move", handling: "take" },
  "床幔絛帶": { visibility: "visible", reach: "move", handling: "take" },
  "濕貨箱": { visibility: "visible", reach: "near", handling: "heavy" },
  "纜繩與鐵錨": { visibility: "visible", reach: "move", handling: "fixed" },
  "生鏽魚網": { visibility: "visible", reach: "move", handling: "take" },
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
    conditions: "堂主坐在案前時，異常舉動會引來盤問；兩名持刀幫眾守正門。",
    objects: [
      { name: "青銅燭台", position: "何不歸手邊案上", access: "須逼近案前三步，會招致反擊", use: "點火或砸人" },
      { name: "太師椅", position: "正堂兩側", access: "可踢翻，難以投擲", use: "阻路或絆倒敵人" },
      { name: "儀式用青鋒劍", position: "高牆牌匾下", access: "須踩椅攀取；未開刃", use: "硬取後可作鈍器" },
    ],
  },
  "晚秋茶寮": {
    routes: "三面透風的街角茶棚背靠高牆，明路易走，難以固守。",
    conditions: "白日動手會招人圍觀；容晚秋守著櫃檯。",
    entrance: { position: "煮茶土灶底的空心石板", access: "先得知入口，再趁土灶無人看守時移開石板" },
    objects: [
      { name: "沸水銅壺", position: "滾水土灶上", access: "伸手可取，會燙傷手掌", use: "潑水擋敵" },
      { name: "缺腳長木凳", position: "茶棚外側", access: "可隨手拿起，擋刀易碎", use: "鈍器或路障" },
      { name: "茶渣爛泥", position: "茶棚地面", access: "須俯身抓取，貼身易被搶攻", use: "撒眼或使人滑倒" },
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
    ],
  },
  "裂石擂": {
    routes: "擂台在中央，兩側木階可上下；觀眾與鐵網圍住四面。",
    conditions: "觀眾擁擠，逃離須先擠出人群；旁人通常不會介入台上勝負。",
    objects: [
      { name: "粗麻圍繩", position: "擂台邊", access: "靠近邊緣可抓住", use: "借力或纏縛" },
      { name: "血浸粗沙", position: "擂台地面", access: "俯身可抓取，揚距短", use: "撒眼；血濕處易滑" },
      { name: "角柱鐵箍木樁", position: "擂台四角", access: "固定不可搬動", use: "借衝力撞擊對手" },
    ],
  },
  "苦煙館": {
    routes: "前舖後居，前門臨街；後院翻牆通後巷。",
    conditions: "走廊藥煙遮眼，久留傷神；顧忘生不信任生面孔。",
    objects: [
      { name: "無名藥粉瓷瓶", position: "櫃檯後排架", access: "須接近或獲顧忘生允許；藥性未辨不能預知", use: "固定藥性，盲用有中毒風險" },
      { name: "炭爐", position: "夾道腳邊", access: "靠近可踢翻，炭火會灼傷衣物", use: "阻路生煙" },
      { name: "泡蛇藥酒罈", position: "後舖", access: "重逾三十斤，搬動緩慢", use: "砸碎後須明火才可助燃" },
    ],
  },
  "夜雨樓": {
    routes: "三層樓有曲折迴廊；正門臨街，後門通小巷，二樓窗可至鄰屋頂。",
    conditions: "動武會招官府注意；上二樓須熟人帶路或付錢。",
    entrance: { position: "後院酒窖最深處的廢棄巨桶內", access: "先進酒窖並避開護院，再開桶內暗門" },
    objects: [
      { name: "銅鏡", position: "房內梳妝檯", access: "須進房才可取", use: "反光或撞擊，不會碎成玻璃刃" },
      { name: "瓷罐與胭脂", position: "房內几案", access: "須進房才可取", use: "瓷片割手或揚粉迷目" },
      { name: "床幔絛帶", position: "房內床沿", access: "須進房才可扯下", use: "纏刀、縛腕；不足以吊人" },
    ],
  },
  "碼頭": {
    routes: "一面臨水，貨箱圍住三面；棧橋窄，退路有限。",
    conditions: "夜風妨礙火攻並掩蓋腳步；跳水會受傷，重物難保。",
    objects: [
      { name: "濕貨箱", position: "棧道側", access: "須靠近費力推倒", use: "掩體或截路" },
      { name: "纜繩與鐵錨", position: "船邊", access: "纜繩繃緊須利刃割；鐵錨不可投擲", use: "絆索或牽制" },
      { name: "生鏽魚網", position: "木架上", access: "可扯下，倒鉤也會掛住自己", use: "裹住一人" },
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
  return { discoveredEntrances, openedEntrances, depletedSources, movedObjects, objectHolders,
    medicineIdentified: value.medicineIdentified === true, medicineUsed: value.medicineUsed === true,
    medicineKind: "散氣粉" };
}

export function objectStatus(scene: SceneState, name: string): ObjectRule | undefined {
  if (name === "無名藥粉瓷瓶" && scene.medicineUsed) return undefined;
  const rule = OBJECT_RULES[name];
  if (!rule) return undefined;
  return { ...rule, holder: scene.objectHolders[name] ?? rule.holder };
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
      return `${object.name}在${scene.movedObjects[object.name] || object.position}；${reach}；${handling}；${rule.holder ? `由${rule.holder}持有；` : ""}${object.access}；${object.use}${identity}`; }).join("。 ");
  const entrance = site.entrance && scene.discoveredEntrances.includes(place as PassageEntrance)
    ? `${scene.openedEntrances.includes(place as PassageEntrance) ? "已打開" : "已知但未打開"}暗道入口：${site.entrance.position}；${site.entrance.access}。` : "";
  return `${site.routes}${site.conditions}${objects}。${entrance}`;
}
