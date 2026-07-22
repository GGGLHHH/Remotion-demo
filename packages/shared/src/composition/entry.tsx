import { registerRoot } from 'remotion';
import { CompositionRoot } from './Root';

// 服务端渲染入口(无 custom item 时可直接 bundle 此文件)
registerRoot(CompositionRoot);
