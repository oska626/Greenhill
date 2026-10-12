import type { GameState } from "./game-engine.ts";
import { LANDMARK_SCENES, normalizeSceneState } from "./scene-state.ts";

export type BlackmudAnchor = {
  name: string;
  label: string;
  tone: "ready" | "risk" | "distant" | "spent";
  detail: string;
};

// The HUD describes the player's current reach, not every prop in the landmark.
export function blackmudAnchors(state: GameState): BlackmudAnchor[] {
  if (state.currentLocation !== "黑泥街") return [];
  const scene = normalizeSceneState(state.sceneState, state.worldFlags);
  const moved = (name: string) => scene.movedObjects[name];
  const spent = (name: string) => scene.depletedSources.includes(name)
    || /倒翻|撞散|踩碎|折斷/.test(moved(name) || "");
  const behindWall = state.flags.marketAftermath && state.flags.marketAftermathKind === "escape";
  if (state.flags.alleyEscape || behindWall) {
    const bambooBehind = behindWall && /牆背/.test(moved("廢竹籮") || "");
    return [
      { name: "廢竹籮", label: spent("廢竹籮") ? "已耗盡" : bambooBehind ? "可及" : behindWall ? "未及" : moved("廢竹籮") ? "已移位" : "可取",
        tone: spent("廢竹籮") ? "spent" : behindWall && !bambooBehind ? "distant" : "ready",
        detail: spent("廢竹籮") ? "竹籮已散，不能再踩著翻牆。"
          : bambooBehind ? "竹籮被踢到牆背，可暫作路障。"
            : behindWall ? "竹籮仍在牆另一邊，眼下夠不到。" : "巷尾可踢到牆邊踏腳；攀爬時仍會暴露身位。" },
      { name: "餿水桶", label: spent("餿水桶") ? "已耗盡" : behindWall ? "未及" : moved("餿水桶") ? "已移位" : "可取",
        tone: spent("餿水桶") ? "spent" : behindWall ? "distant" : "ready",
        detail: spent("餿水桶") ? "餿水已倒在巷口，桶不能再傾一次。"
          : behindWall ? "水桶留在牆另一邊，眼下夠不到。"
            : moved("餿水桶") ? `水桶現於${moved("餿水桶")}，仍可再碰。` : "推倒可弄滑巷口，也可能礙住自己退路。" },
    ];
  }
  const butcherHoldsKnife = (scene.objectHolders["剁骨刀"] ?? "張斷骨") === "張斷骨";
  const playerHoldsKnife = scene.objectHolders["剁骨刀"] === state.playerName || scene.objectHolders["剁骨刀"] === "玩家";
  const knifeDropped = !butcherHoldsKnife && Boolean(moved("剁骨刀"));
  const drainOpened = /掀開|移開|溝口露出/.test(moved("排污水溝爛木蓋板") || "");
  return [
    { name: "懸肉鐵鉤", label: moved("懸肉鐵鉤") ? "已移位" : "可及", tone: "risk",
      detail: moved("懸肉鐵鉤") ? `鐵鉤現於${moved("懸肉鐵鉤")}；靠近才可再用。` : "掛在肉檔木架，扯下可能劃傷手掌。" },
    { name: "剁骨刀", label: playerHoldsKnife ? "已持有" : butcherHoldsKnife ? "難取" : state.combat ? "未及" : knifeDropped ? "可取" : "未及",
      tone: playerHoldsKnife || knifeDropped && !state.combat ? "ready" : "distant",
      detail: playerHoldsKnife ? "剁骨刀已在你手裡；刀口仍需留意。"
        : butcherHoldsKnife ? "仍在張斷骨手上；貼身強奪易遭反切。"
        : state.combat ? "刀落在肉案附近，刀手隔著去路。" : `刀已脫手，現於${moved("剁骨刀") || "肉案附近"}。` },
    { name: "厚砧板", label: moved("厚砧板") ? "已移位" : "難取", tone: "risk",
      detail: moved("厚砧板") ? `砧板現於${moved("厚砧板")}；沉重難舉。` : "壓在肉案上，須費力掀動，不能擲出去。" },
    { name: "半扇懸掛生豬胴體", label: moved("半扇懸掛生豬胴體") ? "已移位" : "可及", tone: "risk",
      detail: moved("半扇懸掛生豬胴體") ? `豬胴體現於${moved("半扇懸掛生豬胴體")}；擺盪仍可能撞回自己。`
        : "懸在肉架；推動費力，擺盪也可能撞回自己。" },
    { name: "排污水溝爛木蓋板", label: drainOpened ? "已設陷阱" : moved("排污水溝爛木蓋板") ? "已移位" : "需冒險", tone: "risk",
      detail: drainOpened ? "蓋板已被挪開；水溝可能絆倒任何踏錯步的人。"
        : moved("排污水溝爛木蓋板") ? `蓋板現於${moved("排污水溝爛木蓋板")}，溝口未必露出。`
        : "在肉檔外側；須靠到溝邊才可掀起。" },
  ];
}

export function blackmudFocus(state: GameState, event = ""): string[] {
  const anchors = blackmudAnchors(state);
  const namedInEvent = LANDMARK_SCENES["黑泥街"].objects.map((object) => object.name)
    .filter((name) => event.includes(name));
  const usable = anchors.filter((anchor) => anchor.tone !== "spent");
  if (state.flags.alleyEscape) return Array.from(new Set([...namedInEvent, ...usable.map((anchor) => anchor.name)])).slice(0, 2);
  if (state.flags.marketAftermath && state.flags.marketAftermathKind === "escape") return namedInEvent.slice(0, 2);
  const focus = ["懸肉鐵鉤", "剁骨刀"].filter((name) => usable.some((anchor) => anchor.name === name));
  return Array.from(new Set([...namedInEvent, ...(focus.length ? focus : usable.map((anchor) => anchor.name))])).slice(0, 2);
}
