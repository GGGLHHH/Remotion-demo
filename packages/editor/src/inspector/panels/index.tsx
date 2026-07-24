import type React from 'react';
import type { EditorStarterItem } from '@gedatou/shared';
import { ImagePanel } from './ImagePanel';
import { VideoPanel } from './VideoPanel';
import { GifPanel } from './GifPanel';
import { AudioPanel } from './AudioPanel';
import { TextPanel } from './TextPanel';
import { SolidPanel } from './SolidPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { CustomPanel } from './CustomPanel';

type ItemType = EditorStarterItem['type'];
type PanelFor<T extends ItemType> = React.FC<{ item: Extract<EditorStarterItem, { type: T }> }>;

// 每类型一个检查器面板。mapped type 强制覆盖全部类型:新增 item 类型时,若忘了登记面板,此处编译报错。
const ITEM_PANELS: { [T in ItemType]: PanelFor<T> } = {
  image: ImagePanel,
  video: VideoPanel,
  gif: GifPanel,
  audio: AudioPanel,
  text: TextPanel,
  solid: SolidPanel,
  captions: CaptionsPanel,
  custom: CustomPanel,
};

/** 单选条目的检查器:按 item.type 分发到对应类型面板。
 *  联合分发时 TS 无法把 item 自动收窄到具体成员,故分发处做一次断言(唯一一处)。 */
export const ItemPanel: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  const Panel = ITEM_PANELS[item.type] as React.FC<{ item: EditorStarterItem }>;
  return <Panel item={item} />;
};
