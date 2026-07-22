import type { ComponentType } from 'react';
import type { CustomItem } from './types';

// 自定义素材渲染器注册表(模块级单例)。注册是副作用,不随 state 序列化:
// 消费端必须在「预览 app 入口」和「服务端渲染 bundle 入口」都 import 注册模块,
// 否则对应 kind 渲染为空(getCustomItemRenderer 查不到 → ItemRenderer 返回 null)。
export type CustomItemRenderer = ComponentType<{ item: CustomItem }>;

const renderers = new Map<string, CustomItemRenderer>();

export const registerCustomItem = (kind: string, renderer: CustomItemRenderer): void => {
  renderers.set(kind, renderer);
};

export const getCustomItemRenderer = (kind: string): CustomItemRenderer | undefined => renderers.get(kind);
