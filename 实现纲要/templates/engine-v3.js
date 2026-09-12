/**
 * ============================================================
 *  实现纲要-{项目名}.html — 基于 graph-template.html (engine-v3)
 * ============================================================
 *
 *  由"实现纲要"Claude Code Skill 自动生成。
 *  将需求文档转化为交互式代码结构蓝图——类型有向图 + 接口规划 + 实现约定。
 *
 *  engine-v3 新特性：
 *  - 节点类型枚举、边类型枚举、阶段枚举
 *  - 添加节点() 返回节点代理，支持链式调用
 *  - 添加变量() 统一字段声明
 *  - 添加测试() 属性方式，不创建独立节点
 *  - 导出全景图() 完整 JSON 导出
 *
 *  AntV G6 v5 参考：https://g6.antv.antgroup.com/
 *
 *  已知限制：
 *  - G6 画布为 Canvas 渲染，图内节点不支持屏幕阅读器
 *  - 图例帮助、右键菜单、内联浮层未添加 aria-* 属性（面向开发者工具）
 *  - 依赖外部 CDN（cdn.jsdelivr.net/npm），离线不可用
 * ============================================================
 */


// ==================== Dagre 同步加载（确保布局算法在渲染前可用） ====================
// NOTE: G6 v5 dagre 布局依赖外部 dagre 库；若 script 标签异步加载失败，则 setData 后布局不生效
// 使用 XMLHttpRequest 同步加载，保证 const 图 = new Graph(...) 执行时 dagre 已挂到 window
if (typeof dagre === 'undefined') {
  (function () {
    const CDN_URL = 'https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js';
    const FALLBACK_URL = 'https://unpkg.com/dagre@0.8.5/dist/dagre.min.js';
    function 同步加载(地址) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 地址, false); // 同步请求
        xhr.send();
        if (xhr.status >= 200 && xhr.status < 300) {
          window.eval.call(window, xhr.responseText); // 同步执行
          return true;
        }
      } catch (e) { /* 静默，尝试下一个 CDN */ }
      return false;
    }
    if (!同步加载(CDN_URL)) 同步加载(FALLBACK_URL);
  })();
}

// ==================== 回到节点按钮 + 视图检测 ====================

/**
 * 确保画布容器本身可接收事件（不修改 G6 内部多层 canvas 的 pointer-events）
 * NOTE: G6 v5 有多层 canvas（渲染层 + 事件层），内部自行管理 pointer-events。
 *   强制设置所有 canvas 为 auto 会破坏事件分发，导致拖拽/缩放/点击失效。
 *   此函数只确保容器 div 本身不阻断事件。
 */
function 确保画布容器可交互() {
  try {
    const 画布容器 = document.getElementById('g6-canvas');
    if (画布容器) 画布容器.style.pointerEvents = 'auto';
  } catch (e) { /* 静默忽略 */ }
}

/**
 * 右下角"回到节点区域"浮窗按钮：
 * - 画布上无可见节点 或 用户把视图拖离所有节点范围时显示
 * - 点击后调用 fitView + 清空选中状态，回到全览视角
 */
function 初始化回到节点按钮() {
  let 按钮 = document.getElementById('btn-jump-to-content');
  if (按钮) return; // 已创建则跳过
  按钮 = document.createElement('button');
  按钮.id = 'btn-jump-to-content';
  按钮.title = '回到节点区域（适应视图）';
  按钮.style.cssText = [
    'position:absolute', 'right:20px', 'bottom:20px', 'z-index:500',
    'display:none', // 默认隐藏，视图检测后决定是否显示
    'padding:10px 16px', 'border-radius:10px',
    'border:1px solid var(--border,#d9d9d9)',
    'background:rgba(59,130,246,0.95)', 'color:#fff',
    'font-size:14px', 'font-weight:600',
    'cursor:pointer', 'box-shadow:0 6px 18px rgba(0,0,0,0.18)',
    'backdrop-filter:blur(4px)',
  ].join(';');
  按钮.textContent = '🎯 回到节点区域';
  按钮.onclick = function () {
    try { 图.fitView(40); } catch (e) {}
    清空选中状态();
    检测视图是否远离节点();
  };
  const 画布父 = document.getElementById('canvas-container') || document.body;
  画布父.appendChild(按钮);
}

// 视图检测：当前视口是否看不到任何节点
let 视图检测定时器 = null;
function 检测视图是否远离节点() {
  const 按钮 = document.getElementById('btn-jump-to-content');
  if (!按钮) return;
  try {
    const { 可见节点 } = 计算可见元素();
    if (可见节点.length === 0) {
      按钮.style.display = 'inline-block';
      return;
    }
    // 计算节点包围盒是否有任何部分在视口内
    const 画布容器 = document.getElementById('g6-canvas');
    if (!画布容器) return;
    const 画布宽 = 画布容器.clientWidth;
    const 画布高 = 画布容器.clientHeight;
    const 视图矩阵 = 图.getViewTransform();
    let 有节点在视口内 = false;
    for (const n of 可见节点) {
      const nx = typeof n.x === 'number' ? n.x : (typeof n.data?.x === 'number' ? n.data.x : NaN);
      const ny = typeof n.y === 'number' ? n.y : (typeof n.data?.y === 'number' ? n.data.y : NaN);
      if (!isFinite(nx) || !isFinite(ny)) continue;
      // 世界坐标 -> 屏幕坐标
      const sx = nx * 视图矩阵.scale + 视图矩阵.x;
      const sy = ny * 视图矩阵.scale + 视图矩阵.y;
      if (sx >= -200 && sx <= 画布宽 + 200 && sy >= -200 && sy <= 画布高 + 200) {
        有节点在视口内 = true;
        break;
      }
    }
    按钮.style.display = 有节点在视口内 ? 'none' : 'inline-block';
  } catch (e) { 按钮.style.display = 'none'; }
}
function 触发视图检测() {
  clearTimeout(视图检测定时器);
  视图检测定时器 = setTimeout(检测视图是否远离节点, 300);
}

// 在平移/缩放/布局/渲染后触发视图检测（不修改 canvas pointer-events）
function 安装视图监控() {
  try {
    图.on('aftertransform', () => { 触发视图检测(); });
    图.on('afterlayout', () => { setTimeout(() => { 触发视图检测(); }, 60); });
    图.on('afterrender', () => { setTimeout(() => { 触发视图检测(); }, 60); });
  } catch (e) {}
}


/**
 * @patch — 兼容性防护：工作数据区若包含 C++ 示例代码且漏了 // 注释前缀，
 * 此处提供全局 stub 避免 ReferenceError 打断整个工作数据执行。
 * 只吞掉已知的误用，不影响正常的 JS API 调用。
 */
// 全局 stub —— 吞掉工作数据区中 C++ 示例代码漏注释导致的 ReferenceError
window.exampleFunction = function(){};
window.result = undefined;
window.myVar = undefined;

// ==================== engine-v3 枚举定义 ====================

const 节点类型 = {
  类: 'class',
  接口: 'interface',
  结构体: 'struct',
  枚举: 'enum',
  自由函数: 'func',
  成员函数: 'memberfunc',
  自由变量: 'variable',
  成员变量: 'membervar',
};

const 边类型 = {
  拥有: '拥有',
  继承: '继承',
  符合约定: '符合约定',
  符合: '符合',
  调用: '调用',
  依赖: '依赖',
};

const 阶段 = {
  类型识别: '阶段一',
  接口分化: '阶段二',
  实现约定: '阶段三',
};

let 当前阶段 = null;

// 将枚举暴露到 window 上，供工作数据区的 inline script 访问
window.节点类型 = 节点类型;
window.边类型 = 边类型;
window.阶段 = 阶段;

// ==================== UI 动态初始化 ====================
// template.html 只保留容器骨架，所有 UI 元素由此函数动态填充
// 好处：技能模板更新 UI 时只需改 engine-v3.js，已生成的 HTML 刷新后自动获得新 UI

function 初始化UI() {
  // 聚焦模式提示栏（任务 #28：两个退出选项）
  // - "保留更改并退出"：保留聚焦模式中应用的节点过滤更改
  // - "退出"：回退到进入聚焦模式前的节点过滤器状态
  // 步骤指示器
  const 步骤面板 = document.getElementById('step-indicator');
  if (步骤面板) {
    步骤面板.innerHTML = '<div id="step-indicator-inner" style="display:flex;gap:8px;padding:4px 12px;font-size:12px;background:var(--surface);border-bottom:1px solid var(--border);align-items:center">' +
      '<span id="step-1" style="padding:2px 8px;border-radius:4px">① 项目样貌</span>' +
      '<span style="color:var(--text-muted)">→</span>' +
      '<span id="step-2" style="padding:2px 8px;border-radius:4px">② 接口分化+实现约定</span>' +
      '<span style="color:var(--text-muted)">→</span>' +
      '<span id="step-3" style="padding:2px 8px;border-radius:4px">③ 约束集中+测试规划</span>' +
      '<span style="flex:1"></span>' +
      '<span id="view-mode-normal" class="view-mode-btn" style="padding:2px 8px;border-radius:4px;cursor:pointer;background:#d4edda">普通视图</span>' +
      '<span id="view-mode-test" class="view-mode-btn" style="padding:2px 8px;border-radius:4px;cursor:pointer">测试规划</span>' +
    '</div>';
  }

  // 视图切换按钮事件
  setTimeout(() => {
    const 普通视图按钮 = document.getElementById('view-mode-normal');
    const 测试规划按钮 = document.getElementById('view-mode-test');
    if (普通视图按钮 && 测试规划按钮) {
      普通视图按钮.onclick = () => 切换视图模式('普通');
      测试规划按钮.onclick = () => 切换视图模式('测试规划');
    }
  }, 0);

  document.getElementById('focus-bar').innerHTML = '聚焦模式 — 只显示子节点 <button id="btn-exit-focus-keep" title="保留聚焦模式中应用的过滤更改" style="background:rgba(255,255,255,0.35)">保留更改并退出</button><button id="btn-exit-focus" title="回退到进入聚焦前的过滤状态">退出</button>';

  // 过滤器栏
  document.getElementById('filter-bar').innerHTML = `
    <span class="filter-group-label">显示：</span>
    <div class="filter-group">
      <button class="filter-btn on" data-filter="类型">类</button>
      <button class="filter-btn on" data-filter="函数">函</button>
      <button class="filter-btn on" data-filter="成员函数">成员</button>
      <button class="filter-btn on" data-filter="变量">变</button>
      <button class="filter-btn on" data-filter="成员变量">成变</button>
      <button class="filter-btn on" data-filter="枚举">枚举</button>
      <button class="filter-btn on" data-filter="约定">约定</button>
    </div>
    <div class="filter-group">
      <span class="filter-group-label">边：</span>
      <button class="filter-btn on" data-filter="拥有">拥有</button>
      <button class="filter-btn on" data-filter="继承">继承</button>
      <button class="filter-btn on" data-filter="符合约定">符约</button>
      <button class="filter-btn on" data-filter="符合">符合</button>
      <button class="filter-btn on" data-filter="调用">调用</button>
      <button class="filter-btn on" data-filter="依赖">依赖</button>
    </div>
    <div class="filter-group">
      <span class="filter-group-label">分组：</span>
      <button class="filter-btn" data-filter="分组" title="点击选择并折叠分组">组</button>
    </div>
    <div class="filter-group" data-filter-group="项目">
      <span class="filter-group-label">项目：</span>
      <button id="project-filter" class="filter-btn" title="按项目标题多选筛选节点，可勾选多个项目；默认仅显示当前实现纲要。点击弹出多选面板">项目</button>
    </div>
    <div class="filter-group" style="border-right:none;margin-left:auto;gap:6px;flex-shrink:0">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text,#222);cursor:pointer;white-space:nowrap;flex-shrink:0"
        title="显示当前项目直接依赖的其他项目外部节点（仅可见、不可操作、无右键菜单）；切换项目筛选时这些节点自动更新">
        <input id="edge-show-toggle" type="checkbox" style="cursor:pointer;accent-color:#00bcd4">
        <span style="font-size:12px">边缘显示</span>
      </label>
      <div style="position:relative">
        <input id="search-input" type="text" placeholder="搜索节点名称/ID"
          style="padding:5px 12px;border:1px solid var(--border,#d9d9d9);border-radius:6px;background:var(--surface,#fff);color:var(--text,#222);font-size:13px;width:220px;outline:none"
          title="输入节点名称或ID模糊搜索；ESC 清空；回车滚动到第一个匹配节点" />
      </div>
      <button id="btn-fit-view" title="适应视图（重置缩放和平移，查看所有节点）"
        style="padding:5px 12px;border:1px solid var(--border,#d9d9d9);border-radius:6px;background:var(--surface,#fff);color:var(--text,#222);cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap">
        ⊡ 适应视图
      </button>
    </div>
  `;


  // 空状态提示
  document.getElementById('empty-state').innerHTML = `
    <div style="font-size:48px;margin-bottom:12px"></div>
    <div style="font-size:14px;font-weight:500">暂无数据显示</div>
    <div style="font-size:12px;margin-top:4px">请勾选上方过滤器或等待 AI 填入工作数据</div>
  `;

  // 图例
  document.getElementById('legend').innerHTML = `
    <div id="legend-toggle" style="font-size:10px;color:var(--text-muted);cursor:pointer;pointer-events:auto;text-align:right;margin-bottom:2px" onclick="var t=document.getElementById('legend-body');var s=t.style.display==='none'?'block':'none';t.style.display=s;this.textContent=s==='none'?'图例 ▶':'图例 ▼'">图例 ▼</div>
    <div id="legend-body">
      <table style="border-spacing:0 4px;font-size:11px;line-height:1.6">
        <tr><td colspan="2" style="font-size:10px;color:var(--text-muted);padding-bottom:2px">节点</td></tr>
        <tr><td><span style="display:inline-block;width:10px;height:10px;border:2px solid #e67e22;border-radius:50%;background:var(--node-fill);vertical-align:middle"></span> 约定 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('约定',event)">?</span></td>
            <td><span style="display:inline-block;width:10px;height:10px;border:2px solid #4a90d9;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> class <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('class',event)">?</span></td></tr>
        <tr><td><span style="display:inline-block;width:10px;height:10px;border:2px solid #52c41a;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> interface <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('interface',event)">?</span></td>
            <td><span style="display:inline-block;width:10px;height:10px;border:2px solid #b87a0a;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> ◇ enum <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('enum',event)">?</span></td></tr>
        <tr><td><span style="display:inline-block;width:10px;height:10px;border:2px solid #008080;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> func <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('func',event)">?</span></td>
            <td><span style="display:inline-block;width:10px;height:10px;border:2px solid #b0b0b0;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> member <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('member',event)">?</span></td></tr>
        <tr><td><span style="display:inline-block;width:10px;height:10px;border:2px solid #9b59b6;border-radius:2px;background:var(--node-fill);vertical-align:middle;transform:skewX(-20deg);margin:0 2px"></span> ▱ variable <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('variable',event)">?</span></td>
            <td><span style="display:inline-block;width:10px;height:10px;border:2px solid #e91e63;border-radius:2px;background:var(--node-fill);vertical-align:middle;transform:skewX(-20deg);margin:0 2px"></span> ▱ membervar <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('membervar',event)">?</span></td></tr>
        <tr><td><span style="display:inline-block;width:10px;height:10px;border:2px solid #8e8e8e;border-radius:2px;background:var(--node-fill);vertical-align:middle"></span> struct <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('struct',event)">?</span></td><td></td></tr>
        <tr><td colspan="2" style="font-size:10px;color:var(--text-muted);padding:4px 0 2px">置信度 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('置信度',event)">?</span></td></tr>
        <tr><td>🟢 高 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('置信度高',event)">?</span></td>
            <td>🟡 中 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('置信度中',event)">?</span></td></tr>
        <tr><td>🔴 低 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('置信度低',event)">?</span></td><td></td></tr>
        <tr><td colspan="2" style="font-size:10px;color:var(--text-muted);padding:4px 0 2px">边</td></tr>
        <tr><td><span class="legend-edge l-own"></span> 拥有/包含 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('拥有/包含',event)">?</span></td>
            <td><span class="legend-edge l-inherit"></span> 继承/实现 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('继承/实现',event)">?</span></td></tr>
        <tr><td><span class="legend-edge l-convention"></span> 符合约定 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('符合约定',event)">?</span></td>
            <td><span class="legend-edge l-conform"></span> 符合 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('符合',event)">?</span></td></tr>
        <tr><td><span class="legend-edge l-call"></span> 调用 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('调用',event)">?</span></td>
            <td><span class="legend-edge l-depend"></span> 依赖 <span class="legend-help" onclick="event.stopPropagation();显示图例帮助('依赖',event)">?</span></td></tr>
      </table>
    </div>
  `;

  // 触摸提示
  document.getElementById('touch-hint').textContent = '👆 拖拽移动 · 🤏 双指缩放 · 👇 点击节点查看详情';

  // 右键菜单
  document.getElementById('context-menu').innerHTML = `
    <div class="ctx-item" id="ctx-focus">只看直接子节点</div>
    <div class="ctx-item" id="ctx-focus-all">展示所有子节点</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" id="ctx-hide">隐藏此节点</div>
    <div class="ctx-item" id="ctx-hide-children">隐藏直接子节点</div>
    <div class="ctx-item" id="ctx-hide-all-children">隐藏所有子节点</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" id="ctx-filter-children">过滤子节点…</div>
  `;

  // 内联浮层
  document.getElementById('inline-popover').innerHTML = '<button class="popover-close" onclick="关闭内联浮层()">✕</button><div id="popover-content"></div>';

  // 右侧面板
  document.getElementById('type-panel').innerHTML = `
    <button id="panel-toggle" title="折叠/展开面板">◀ 折叠面板</button>
    <div id="type-panel-header">
      📋 节点列表 <span id="type-count" style="font-weight:400;color:var(--text-muted)"></span>
      <span style="display:inline-flex;gap:2px;align-items:center">
        <button id="btn-undo" title="撤回浏览历史" disabled style="padding:2px 8px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:4px;cursor:pointer;font-size:13px">←</button>
        <button id="btn-redo" title="重做浏览历史" disabled style="padding:2px 8px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:4px;cursor:pointer;font-size:13px">→</button>
      </span>
      <button id="inline-toggle" title="内联展开：点节点在图上弹出详情">⊞ 内联</button>
      <button id="panel-pos-toggle" title="切换面板位置（右侧/底部）">⬇</button>
    </div>
    <div id="type-panel-filter">
      <button class="filter-btn on" data-panel-filter="所有">所有</button>
      <button class="filter-btn" data-panel-filter="分组">分组</button>
      <button class="filter-btn" data-panel-filter="类型">类</button>
      <button class="filter-btn" data-panel-filter="函数">函数</button>
      <button class="filter-btn" data-panel-filter="变量">变量</button>
      <button class="filter-btn" data-panel-filter="约定">约定</button>
      <button class="filter-btn" data-panel-filter="枚举">枚举</button>
      <button class="filter-btn" data-panel-filter="测试">测试</button>
    </div>
    <div id="type-panel-list"></div>
  `;
}

// 在 DOM 就绪后立即执行（script 在 body 末尾，DOM 已加载完成）
初始化UI();

// ==================== G6 初始化 ====================

const 容器 = document.getElementById('g6-canvas');
const { Graph, register, ExtensionCategory, Rect } = G6;

// 平行四边形节点：变量/成员变量专用形状（任务 #48）
// 继承 Rect 以复用 size/style 等基础能力，仅重写 drawKeyShape 改为 polygon
// 倾斜方向：右上→左下（向右倾斜），与"输入/输出"图形语义一致
class ParallelogramNode extends Rect {
  drawKeyShape(attributes, container) {
    const [width, height] = this.getSize(attributes);
    const offset = 16; // 倾斜偏移量（向右倾斜）
    // G6 v5 节点坐标系以中心为原点，顶点需以 (0,0) 为中心对称
    const hw = width / 2;
    const hh = height / 2;
    const points = [
      [-hw + offset, -hh],  // 左上
      [hw, -hh],            // 右上
      [hw - offset, hh],    // 右下
      [-hw, hh],            // 左下
    ];
    return this.upsert('key', 'polygon', {
      points,
      fill: attributes.fill,
      stroke: attributes.stroke,
      lineWidth: attributes.lineWidth,
      radius: attributes.radius, // 保留圆角配置（polygon 不直接支持，但传递无副作用）
    }, container);
  }
}
register(ExtensionCategory.NODE, 'parallelogram', ParallelogramNode);

// 聚焦模式：右键"查看子节点"后进入，只显示该节点及其子节点
let 聚焦节点 = null;
// 聚焦深度：1=只看直接子节点，-1=递归展开所有子孙节点（带环检测）
let 聚焦深度 = 1;

// 聚焦模式进入前的过滤器状态快照（任务 #28）
// 进入聚焦模式时保存，退出时根据用户选择决定是否恢复
// 结构：{ 节点过滤器状态: Map, 强制显示集合: Set, 隐藏节点集合: Set }
let 聚焦前快照 = null;

/**
 * 保存当前过滤器状态快照（任务 #28）
 * 在进入聚焦模式前调用，深拷贝三个数据结构
 * 退出聚焦模式时，用户选"退出"则用快照恢复，选"保留更改并退出"则丢弃快照
 */
function 保存聚焦前快照() {
  聚焦前快照 = {
    // Map 深拷贝：键不变，值是普通对象需要逐个复制
    节点过滤器状态: new Map(
      Array.from(节点过滤器状态.entries()).map(([k, v]) => [k, { ...v }])
    ),
    强制显示集合: new Set(强制显示集合),
    隐藏节点集合: new Set(隐藏节点集合),
  };
}

/**
 * 从快照恢复过滤器状态（任务 #28）
 * 清空当前三个数据结构，用快照内容填充
 */
function 恢复聚焦前快照() {
  if (!聚焦前快照) return;
  节点过滤器状态.clear();
  聚焦前快照.节点过滤器状态.forEach((v, k) => 节点过滤器状态.set(k, { ...v }));
  强制显示集合.clear();
  聚焦前快照.强制显示集合.forEach(v => 强制显示集合.add(v));
  隐藏节点集合.clear();
  聚焦前快照.隐藏节点集合.forEach(v => 隐藏节点集合.add(v));
  聚焦前快照 = null;
}

// 过滤器状态
const 过滤器 = {
  类型: true, 函数: true, '成员函数': true, 变量: true, '成员变量': true, 枚举: true, 约定: true,
  拥有: true, 继承: true, '符合约定': true, '符合': true, '调用': true, '依赖': true,
};

// 存储所有注册的数据，用于过滤
const 数据仓库 = {
  节点约束: new Map(),  // 节点id -> 约束数组
  节点: new Map(),
  边: new Map(),
  节点成员函数: new Map(),
  节点成员变量: new Map(), // 变量版：父节点id -> [{变量名, 类型, 职责, 对应需求条目}]
  节点约束: new Map(),
  责任映射: new Map(),
  分组: new Map(), // 组名 -> Set<节点id>
};

// 视图模式：'普通' | '测试规划'
// 测试规划视图：突出显示测试项，节点上显示测试数量角标
let 当前视图模式 = '普通';

// 已激活（折叠）的分组名集合
const 激活的分组 = new Set();

// 用户手动隐藏的节点 id 集合（任务 #24）
// 通过右键菜单"隐藏节点/子节点/所有子节点"添加
// 点击最上方过滤器时清空，还原所有节点
const 隐藏节点集合 = new Set();

// 强制显示集合：突破全局过滤器强制显示的节点（任务 #27）
// 当节点过滤器启用全局隐藏的类型时，对应子节点加入此集合
// 例如全局隐藏"成员函数"，节点过滤器可单独让某节点的成员函数显示
// 点击最上方过滤器时一并清空
const 强制显示集合 = new Set();

// 节点过滤器状态：保存每个节点上次应用过滤器时的设置（任务 #27）
// 用于弹窗打开时回显上次的状态，而非每次都从全局开始
// 结构：节点id -> { 类型, 函数, '成员函数', 枚举, 约定, 范围 }
const 节点过滤器状态 = new Map();

// 节点分类
const 节点分类 = new Map();

// 当前项目名称（命名空间前缀）—— 由 api.设置项目名称() 设置
// 设置后，所有 api.添加节点() 的 ID 自动加此前缀（如 "项目A.订单"）
// 引用同项目类型可用短名（解析节点ID 自动补全），引用他项目类型用全名
let 当前项目名称 = '';

// ==================== 跨项目显示过滤 ====================
// 项目过滤集合：
//   null          → 默认模式，只显示当前项目(当前项目名称)的节点（引用节点默认隐藏）
//   empty Set []  → 显示全部项目
//   Set<项目名>   → 只显示这些项目的节点
let 项目过滤集合 = null;

// ==================== 边缘显示（仅可见的外部接口节点） ====================
// 边缘显示开关：勾选后，被当前项目节点直接依赖（拥有/继承/约定/符合/调用/依赖边）
// 的其他项目节点仍会显示，但仅可见、不可操作，用于直观展示本项目依赖的外部接口
let 边缘显示开关 = false;
// 当前画布上处于"仅可见"状态的边缘只读节点 id 集合（每次刷新视图时重建）
let 边缘只读节点集合 = new Set();

// 计算当前项目的直接依赖外部节点（边缘只读节点集合）
// 入参 可见节点id：当前已通过项目过滤、处于可交互状态的节点集合
function 计算边缘只读节点(可见节点id) {
  const 结果 = new Set();
  if (!边缘显示开关) return 结果;
  // 数据仓库.边 是 Map<key, 边数组>，需展平每条边
  for (const 边数组 of 数据仓库.边.values()) {
    for (const e of 边数组) {
      const 类型 = e.关系类型 || '拥有';
      if (!过滤器[类型]) continue; // 只考虑当前处于显示状态的依赖边
      // 源属于可交互节点（当前项目），目标来自被过滤掉的其他项目 → 作为边缘节点显示
      if (可见节点id.has(e.source) && !是否属于过滤项目(e.target)) {
        结果.add(e.target);
      }
    }
  }
  return 结果;
}

// 判断某节点是否属于当前项目过滤范围
// 组节点等动态节点(无 所属项目)按其成员逻辑处理，此处直接放行
function 是否属于过滤项目(节点id) {
  const 节点 = 数据仓库?.节点?.get(节点id);
  if (!节点) return true; // 非数据仓库真实节点（组节点等）放行
  const 所属 = 节点.所属项目;
  if (项目过滤集合 === null) {
    // 默认模式：仅当前项目（无 所属项目 的旧数据视为当前项目）
    return !所属 || 所属 === 当前项目名称;
  }
  if (项目过滤集合.size === 0) return true; // 全部
  if (!所属) return 项目过滤集合.has(当前项目名称);
  return 项目过滤集合.has(所属);
}

// 边分类
const 边分类 = new Map();

// 约定边集合
const 约定边集合 = new Set();

// 当前高亮的节点 id
let 当前高亮节点 = null;

// ==================== Toast ====================

function 显示提示(消息, 时长 = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = 消息;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 时长);
}

// ==================== 主题工具 ====================

function 读取主题色() {
  const cs = getComputedStyle(document.documentElement);
  const dark = {
    节点填充:'#252540', 节点文字:'#e0e0e0', 强调色:'#6db3f2',
    成功色:'#5cdb5c', 警告色:'#ffc53d', 危险色:'#ff6b6b',
    文字次要:'#a0a0b8', 表面:'#252540'
  };
  const light = {
    节点填充:'#ffffff', 节点文字:'#333333', 强调色:'#4a90d9',
    成功色:'#52c41a', 警告色:'#faad14', 危险色:'#ff4d4f',
    文字次要:'#666666', 表面:'#ffffff'
  };
  const map = {
    节点填充:'--node-fill', 节点文字:'--node-text', 强调色:'--accent',
    成功色:'--success', 警告色:'--warning', 危险色:'--danger',
    文字次要:'--text-secondary', 表面:'--surface'
  };
  const r = {}; let allEmpty = true;
  for (const [k,c] of Object.entries(map)) {
    const v = cs.getPropertyValue(c).trim();
    if (v) allEmpty = false;
    r[k] = v;
  }
  if (allEmpty) {
    console.warn('[theme] CSS vars empty, fallback dark theme');
    for (const [k,v] of Object.entries(dark)) {
      if (!r[k]) r[k] = v;
    }
  } else {
    for (const [k,v] of Object.entries(light)) {
      if (!r[k]) r[k] = v;
    }
  }
  return r;
}
const 主题 = 读取主题色();

const 图 = new Graph({
  container: 'g6-canvas',
  data: { nodes: [], edges: [] },
  autoFit: false, // 禁用自动适应——用户手动缩放/平移后不应被重置
  autoResize: true, // 本地 G6 构建默认 false（不监听 resize），必须显式开启：窗口变化时经 300ms 防抖调用 resize() 跟随容器新尺寸；视图变换不被重置，与 autoFit:false 的意图一致
  padding: [40, 40, 40, 40],
  background: (getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim()) || '#16162a',
  layout: {
    type: 'dagre',
    rankdir: 'LR',
    align: 'DL',
    nodesep: 24,
    ranksep: 80,
  },
  node: {
    type: (d) => {
      if (d.nodeType === 'group') return 'hexagon';
      const 原始 = 数据仓库.节点.get(d.id);
      if (原始?.类型 === 'enum') return 'diamond'; if (原始?.类型 === 'interface' && 原始?.是约定类型) return 'circle'; if (原始?.类型 === 'variable' || 原始?.类型 === 'membervar') return 'parallelogram'; return 'rect';
    },
    style: {
      size: (d) => {
        if (d.nodeType === 'group') {
          const gname = d.名称 || d.id || '';
          return [Math.max(140, gname.length * 16 + 60), 56];
        }
        const 原始 = 数据仓库.节点.get(d.id);
        const name = (d.名称 || d.id || '');
        const w = Math.max(140, name.length * 16 + 40);
        // 枚举值不再在画布上显示，节点使用默认大小——枚举值在右侧面板展开详情中查看
        return [w, 48];
      },
      radius: 6,
      fill: (d) => d.nodeType === 'group' ? 主题.节点填充 : 主题.节点填充,
      stroke: (d) => d.nodeType === 'group' ? '#e67e22' : 主题.强调色,
      lineWidth: (d) => d.nodeType === 'group' ? 3 : 2,
      labelText: (d) => {
        if (d.nodeType === 'group') {
          return '📦 ' + (d.名称 || d.id) + ' (' + (d.成员数 || 0) + ')';
        }
        const 原始 = 数据仓库.节点.get(d.id);
        let text = 原始?.名称 || d.id; const conf = d.confidence || "中"; const confDot = { 高: "🟢", 中: "🟡", 低: "🔴" }[conf] || "🟡"; text = confDot + " " + text;
        // type tags removed per user request
        // typeTag removed
        // 枚举值不在画布上显示（避免长文本），在右侧面板展开详情中查看
        if (原始?.已附加约定?.length) {
          text += '\n🏷' + 原始.已附加约定.map(function(cid) {
            var cn = 数据仓库.节点.get(cid);
            return cn ? cn.名称 : cid;
          }).join(',');
        }
        return text;
      },
      labelFill: 主题.节点文字,
      labelFontSize: 12,
      labelFontWeight: 500,
      labelPlacement: 'center',
      labelOffsetY: 0,
      
      ports: [
        { key: 'left',  placement: [0, 0.5] },
        { key: 'right', placement: [1, 0.5] },
        { key: 'top',   placement: [0.5, 0] },
        { key: 'bottom', placement: [0.5, 1] },
      ],
    },
    state: {
      // 类型边框颜色（shadowBlur:0 确保清除搜索高亮残留的发光效果）
      'class':     { stroke: '#4a90d9', lineWidth: 2, shadowBlur: 0 },
      'interface': { stroke: '#52c41a', lineWidth: 2, shadowBlur: 0 },
      'struct':    { stroke: '#8e8e8e', lineWidth: 2, shadowBlur: 0 },
      'enum':      { stroke: '#b87a0a', lineWidth: 2, shadowBlur: 0 },
      'func':      { stroke: '#008080', lineWidth: 2, shadowBlur: 0 },
      'memberfunc':{ stroke: '#b0b0b0', lineWidth: 1.5, shadowBlur: 0 },
      // 变量节点：紫色（自由变量）；成员变量用粉红色明显区分（任务 #49）
      // membervar 不再用浅紫（与 variable 同色系难辨），改为完全不同色系
      'variable':  { stroke: '#9b59b6', lineWidth: 2, shadowBlur: 0 },
      'membervar': { stroke: '#e91e63', lineWidth: 2, shadowBlur: 0 },
      'group':     { stroke: '#e67e22', lineWidth: 3, shadowBlur: 0 },
      // 可信度线型
      '置信度高': {},
      '置信度中': {},
      '置信度低': {},
      '选中': { lineWidth: 4, stroke: '#3b82f6', shadowBlur: 12, shadowColor: 'rgba(59,130,246,0.5)' },
      // 名称匹配：金色边框+发光
      '名称匹配': { lineWidth: 4, stroke: '#fbbf24', shadowBlur: 16, shadowColor: 'rgba(251,191,36,0.7)' },
      // 内容匹配：橙色边框+发光（比金色稍暗）
      '内容匹配': { lineWidth: 3, stroke: '#f97316', shadowBlur: 10, shadowColor: 'rgba(249,115,22,0.5)' },
      // 边缘只读：被过滤外部项目的可见接口节点——青色粗虚线边框，一眼可辨来自其他项目且不可操作
      '边缘只读': { lineWidth: 4, stroke: '#00bcd4', lineDash: [7, 4], shadowBlur: 10, shadowColor: 'rgba(0,188,212,0.5)' },
    },
  },
  edge: {
    type: 'line',
    style: {
      stroke: 主题.强调色,
      lineWidth: 2,
      endArrow: true,
      sourcePort: 'right',
      targetPort: 'left',
      labelText: '',
    },
    state: {
      '继承': { stroke: 主题.成功色, lineDash: [8, 4] },
      '符合约定': { stroke: '#9b59b6', lineDash: [4, 4], lineWidth: 2 },
      '符合': { stroke: 主题.警告色, lineDash: [3, 3] },
      '调用': { stroke: 主题.危险色, lineWidth: 2 },
      '依赖': { stroke: '#95a5a6', lineDash: [6, 4], lineWidth: 1.5 },
      '高亮': { lineWidth: 4.5, endArrow: true, shadowBlur: 8, shadowColor: 'rgba(59,130,246,0.55)' },
    },
  },
  behaviors: [
    'drag-canvas',
    // minZoom 防止缩太小导致文字模糊；enableOptimize 在缩小时自动隐藏标签提升清晰度
    { type: 'zoom-canvas', minZoom: 0.3, maxZoom: 3, enableOptimize: true },
    { type: 'drag-element', enableTransient: true },
  ],
  animation: false,
});

图.render();

// 首次渲染后自动适应视图一次；后续刷新视图不再自动 fitView，保持用户缩放/平移
let 首次渲染完成 = false;
图.on('afterlayout', function () {
  触发视图检测();
  if (!首次渲染完成) {
    首次渲染完成 = true;
    setTimeout(() => {
      try { 图.fitView(40); } catch (e) {}
    }, 100);
  }
});

// 回到节点按钮 + 视图检测（不修改 G6 canvas pointer-events，避免破坏事件分发）
setTimeout(() => {
  初始化回到节点按钮();
  安装视图监控();
  确保画布容器可交互();
  检测视图是否远离节点();
}, 100);

// ==================== 主题切换监听 ====================

// 容器尺寸观察器：本 G6 构建的 autoResize 仅监听 window resize 事件，
// 拖拽面板分隔条等纯容器尺寸变化不会触发。ResizeObserver 在 observe 时
// 还会立即回调一次，可顺带校正页面加载初期 UI 动态填充造成的画布偏差。
// 300ms 防抖与 G6 内部 onResize 防抖保持一致，避免拖拽过程中频繁 resize。
(() => {
  const 容器 = document.getElementById('g6-canvas');
  if (!容器 || typeof ResizeObserver === 'undefined') return;
  let 防抖定时器 = null;
  const 观察器 = new ResizeObserver(() => {
    clearTimeout(防抖定时器);
    防抖定时器 = setTimeout(() => { try { 图.resize(); } catch (e) {} }, 300);
  });
  观察器.observe(容器);
})();

const 暗色媒体查询 = window.matchMedia('(prefers-color-scheme: dark)');

function 应用主题到图() {
  const 新背景色 = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim();
  document.getElementById('g6-canvas').style.background = 新背景色;
  图.render();
}

暗色媒体查询.addEventListener('change', () => {
  应用主题到图();
  显示提示('已切换为' + (暗色媒体查询.matches ? '暗色' : '亮色') + '主题', 1500);
});

// ==================== 过滤器 ====================

// 画布过滤器栏（#filter-bar 中的按钮）
const 过滤按钮们 = document.querySelectorAll('#filter-bar .filter-btn');
过滤按钮们.forEach(按钮 => {
  按钮.addEventListener('click', (ev) => {
    const f = 按钮.dataset.filter;
    // 项目多选按钮（id=project-filter）无 data-filter，不参与普通过滤器 toggle
    if (!f) return;
    // "分组"按钮特殊处理：弹出组列表，不 toggle 过滤器状态
    if (f === '分组') {
      弹出分组列表(按钮);
      return;
    }
    // 任务 #24：点击顶部过滤器按钮时清空隐藏集合，还原所有被手动隐藏的节点
    // 任务 #27：仅当点击"类型"过滤器时才重置节点过滤器状态
    //   - 类型过滤器（类型/函数/成员函数/枚举/约定）改变 → 重置所有节点过滤器
    //     因为"全局类型过滤器每一次设置就相当于设置所有节点的过滤器"
    //   - 线过滤器（拥有/继承/约定依赖/检测/触发）改变 → 保留节点过滤器状态
    //     线过滤器只控制边的显示，不影响节点的类型过滤
    const 是类型过滤器 = ['类型', '函数', '成员函数', '变量', '成员变量', '枚举', '约定'].includes(f);
    if (是类型过滤器 && (隐藏节点集合.size > 0 || 强制显示集合.size > 0 || 节点过滤器状态.size > 0)) {
      隐藏节点集合.clear();
      强制显示集合.clear();
      节点过滤器状态.clear();
      显示提示('已还原所有节点过滤状态', 1200);
    }
    过滤器[f] = !过滤器[f];
    按钮.classList.toggle('on', 过滤器[f]);
    刷新视图();
  });
});

// ==================== 搜索框 + 适应视图按钮 ====================
let 搜索关键词 = '';
let 搜索防抖定时器 = null;

// ==================== 项目筛选下拉框 ====================
// 收集数据仓库中所有存在的项目名（节点的 所属项目 去重）
function 收集项目列表() {
  const 项目集合 = new Set();
  数据仓库.节点.forEach(n => {
    if (n.所属项目) 项目集合.add(n.所属项目);
  });
  return Array.from(项目集合).sort((a, b) => a.localeCompare(b, 'zh'));
}

// ==================== 项目多选弹出层 + 边缘显示开关 ====================

// 项目弹出层（仿分组弹出层，支持多选项目）
const 项目弹出层 = document.createElement('div');
项目弹出层.id = 'project-popup';
项目弹出层.style.cssText = 'display:none;position:absolute;background:var(--bg,#fff);border:1px solid var(--border,#ddd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:6px 0;max-height:320px;overflow-y:auto;z-index:1000;min-width:190px;font-size:13px;';
document.body.appendChild(项目弹出层);

// 点击其他地方关闭项目弹出层
document.addEventListener('click', (ev) => {
  const 是项目按钮 = ev.target && (ev.target.id === 'project-filter' || ev.target.closest && ev.target.closest('#project-filter'));
  if (!项目弹出层.contains(ev.target) && !是项目按钮) {
    项目弹出层.style.display = 'none';
  }
});

// 当前选择是否命中"全部项目"，供弹出层回显
function 项目是否全选() {
  return 项目过滤集合 !== null && 项目过滤集合.size === 0;
}
// 解析当前生效的选中项目名集合（null 默认态 → 仅当前项目）
function 解析选中项目名() {
  if (项目过滤集合 === null) return new Set(当前项目名称 ? [当前项目名称] : []);
  return 项目过滤集合;
}

// 刷新项目按钮文本 + 弹出层内容（不切换弹出层显示状态）
function 刷新项目下拉框() {
  const 按钮 = document.getElementById('project-filter');
  const 项目列表 = 收集项目列表();
  // 按钮文本回显当前选择状态
  if (按钮) {
    if (项目过滤集合 === null) 按钮.textContent = '项目 · ' + (当前项目名称 || '当前');
    else if (项目过滤集合.size === 0) 按钮.textContent = '项目 · 全部';
    else 按钮.textContent = '项目 · ' + 项目过滤集合.size;
  }
  // 渲染弹出层
  if (项目列表.length === 0) {
    项目弹出层.innerHTML = '<div style="padding:10px 16px;color:#999;">暂无项目（当前为无项目数据）</div>';
    return;
  }
  const 全选 = 项目是否全选();
  const 选中集合 = 解析选中项目名();
  // 直接拼装完整内容（全选行 + 各项目多选行）
  项目弹出层.innerHTML = '';
  const 全选行 = document.createElement('div');
  全选行.className = 'group-item group-select-all';
  全选行.style.cssText = 'padding:8px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#ddd);font-weight:600';
  全选行.innerHTML = `<span>${全选 ? '☑ 全不选' : '🔲 全部项目'}</span><span style="color:#999;font-size:11px;">${全选 ? '全部' : (选中集合.size + '/' + 项目列表.length)}</span>`;
  项目弹出层.appendChild(全选行);
  项目列表.forEach(项目名 => {
    const 已选 = 全选 || 选中集合.has(项目名);
    const 是否当前 = 项目名 === 当前项目名称;
    const 行 = document.createElement('div');
    行.className = 'group-item';
    行.dataset.project = 项目名;
    // 选中行：深青蓝底 + 白色加粗字体，保证文字与背景对比清晰
    行.style.cssText = `padding:8px 16px;cursor:pointer;display:flex;align-items:center;${已选 ? 'background:#0288d1;color:#fff;font-weight:600;' : ''}`;
    // 直接显示项目名称（不用"当前/外部"标签）；当前项目前加 🎯 便于识别默认勾选项
    行.innerHTML = `<span style="margin-right:8px">${已选 ? '✅' : '⬜'}</span><span>${是否当前 ? '🎯 ' : ''}${项目名}</span>`;
    // hover 聚焦：柔和变色（未选中浅蓝、选中深蓝），移走必然还原（未选中清空背景→弹窗底色）
    const 悬停底色 = 'rgba(59,130,246,0.14)';
    行.addEventListener('mouseenter', () => { 行.style.background = 已选 ? '#026aa7' : 悬停底色; });
    行.addEventListener('mouseleave', () => { 行.style.background = 已选 ? '#0288d1' : ''; });
    项目弹出层.appendChild(行);
  });

  // 全选/全不选切换
  全选行.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (全选) {
      // 全不选 → 回到默认"仅当前项目"
      项目过滤集合 = new Set(当前项目名称 ? [当前项目名称] : []);
    } else {
      // 全部项目
      项目过滤集合 = new Set();
    }
    应用项目过滤变更();
  });

  // 单个项目多选
  项目弹出层.querySelectorAll('.group-item[data-project]').forEach(行 => {
    行.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const 项目名 = 行.dataset.project;
      if (项目过滤集合 === null) {
        // 默认"仅当前"状态下勾选某项目 → 保留当前项目，同时加入所选项目
        项目过滤集合 = new Set(当前项目名称 ? [当前项目名称] : []);
        项目过滤集合.add(项目名);
      } else if (项目过滤集合.size === 0) {
        // "全部"状态下勾选某项目 → 退化为只选该项目
        项目过滤集合 = new Set([项目名]);
      } else {
        if (项目过滤集合.has(项目名)) 项目过滤集合.delete(项目名);
        else 项目过滤集合.add(项目名);
      }
      应用项目过滤变更();
    });
    行.addEventListener('mouseenter', () => { 行.style.background = (行.style.background.includes('e0f7fa') ? '#c5ecf5' : '#f5f5f5'); });
    行.addEventListener('mouseleave', () => { 行.style.background = (行.style.background.includes('c5ecf5') || 行.style.background.includes('f5f5f5')) ? '' : 行.style.background; });
  });
}

// 项目过滤/全选状态变更后的统一处理：刷新视图、面板并记录历史
function 应用项目过滤变更() {
  刷新视图();
  刷新类型面板();
  刷新项目下拉框();
  记录浏览历史(捕获当前状态());
}

// 项目按钮：弹出项目多选面板
function 弹出项目列表(触发按钮) {
  if (项目弹出层.style.display === 'block') {
    项目弹出层.style.display = 'none';
    return;
  }
  刷新项目下拉框();
  const rect = 触发按钮.getBoundingClientRect();
  项目弹出层.style.display = 'block';
  项目弹出层.style.left = rect.left + 'px';
  项目弹出层.style.top = (rect.bottom + 4) + 'px';
}

setTimeout(() => {
  const 项目按钮 = document.getElementById('project-filter');
  if (项目按钮) {
    项目按钮.addEventListener('click', (ev) => { ev.stopPropagation(); 弹出项目列表(项目按钮); });
  }
  // 边缘显示开关：控制是否显示当前项目直接依赖的外部接口节点
  const 边缘开关 = document.getElementById('edge-show-toggle');
  if (边缘开关) {
    边缘开关.addEventListener('change', () => {
      边缘显示开关 = 边缘开关.checked;
      刷新视图();
      if (边缘显示开关) {
        显示提示('边缘显示已开启：展示直接依赖的外部项目接口（仅可见，不可操作）', 2200);
      }
    });
  }
}, 0);

// 适应视图按钮
setTimeout(() => {
  const 适应视图按钮 = document.getElementById('btn-fit-view');
  if (适应视图按钮) {
    适应视图按钮.addEventListener('click', () => {
      try {
        图.fitView(40);
        显示提示('已适应视图', 1000);
      } catch (e) {
        显示提示('适应视图失败：' + e.message, 2000);
      }
    });
  }
  // 搜索框
  const 搜索框 = document.getElementById('search-input');
  if (搜索框) {
    // 防抖输入
    搜索框.addEventListener('input', (e) => {
      clearTimeout(搜索防抖定时器);
      const 值 = e.target.value;
      搜索防抖定时器 = setTimeout(() => 执行搜索(值), 180);
    });
    // ESC 清空
    搜索框.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        搜索框.value = '';
        执行搜索('');
        搜索框.blur();
      } else if (e.key === 'Enter') {
        // 回车：如果有匹配则滚动到第一个匹配的右侧条目
        const 第一个匹配 = 面板容器.querySelector('.type-accordion[data-node-id*="' + 搜索关键词.trim().toLowerCase() + '"]');
        if (第一个匹配) {
          第一个匹配.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }
}, 0);

/**
 * 执行节点搜索：
 * - 名称匹配的节点 → 金色高亮（"名称匹配" state），在右侧面板中排最前
 * - 内容匹配的节点（描述/签名/成员等包含关键词）→ 橙色高亮（"内容匹配" state），排在名称匹配之后
 * - 不匹配的节点在右侧面板中隐藏
 * - 搜索清空时恢复所有节点初始状态
 * @param {string} 值 用户输入的关键词
 */
// 记录当前被设置了搜索 state 的节点 id，清空搜索时只清除这些节点的搜索 state
let 搜索状态节点集合 = new Set();

function 执行搜索(值) {
  // 记录上一轮搜索是否有匹配节点，用于清空时判断是否需要刷新视图
  const 原搜索有匹配 = 搜索状态节点集合.size > 0;
  搜索关键词 = (值 || '').trim().toLowerCase();

  // 搜索清空时同步 DOM input 的 value
  if (!搜索关键词) {
    const 输入框 = document.getElementById('search-input');
    if (输入框 && 输入框.value) 输入框.value = '';
  }

  // 清除上一轮搜索设置的 state（只清除搜索相关 state，保留"选中" state）
  // 关键：不能简单用 setElementState(id, []) — 会清除 type states（class/func/variable 等）
  // 导致节点失去类型颜色。需要重建原始 states：[类型, '置信度X', 可选'选中']
  for (const id of 搜索状态节点集合) {
    try {
      const 原始 = 数据仓库.节点.get(id);
      if (原始) {
        // 重建 type + 置信度 states
        const 基础states = [原始.类型 || 'class', '置信度' + (原始.置信度 || '中')];
        // 保留选中状态
        if (id === 当前选中节点id) 基础states.push('选中');
        // 已附加约定标记
        if (原始.已附加约定?.length) 基础states.push('已附加约定');
        图.setElementState(id, 基础states);
      } else {
        // fallback：只移除搜索相关 state
        const 当前状态 = 图.getElementState(id) || [];
        const 新状态 = 当前状态.filter(s => s !== '名称匹配' && s !== '内容匹配' && s !== '搜索匹配');
        图.setElementState(id, 新状态);
      }
    } catch (e) {}
  }
  搜索状态节点集合.clear();

  // 搜索清空时强制刷新视图，让 G6 重新计算所有节点的默认样式
  // 修复 G6 v5 bug：清除 state 后 renderStyle（stroke 颜色）不会自动恢复
  if (!搜索关键词 && 原搜索有匹配) {
    刷新视图();
  }

  刷新类型面板();

  if (!搜索关键词) {
    // 搜索清空时不需要额外操作，状态已清除
    return;
  }

  const 名称匹配节点 = [];
  const 内容匹配节点 = [];
  const { 可见节点 } = 计算可见元素();

  for (const n of 可见节点) {
    const 原始 = 数据仓库.节点.get(n.id) || n;
    const 名称 = (原始.名称 || n.id || '').toString().toLowerCase();
    const ID = (原始.id || n.id || '').toString().toLowerCase();

    const 名称匹配 = 名称.includes(搜索关键词) || ID.includes(搜索关键词);

    // 内容匹配：在签名、枚举值、类型名、已附加约定、成员函数名、成员变量名中搜索
    let 内容匹配 = false;
    if (!名称匹配) {
      const 签名 = (原始.签名 || '').toString().toLowerCase();
      if (签名.includes(搜索关键词)) { 内容匹配 = true; }
      if (!内容匹配 && 原始.枚举值) {
        for (const ev of 原始.枚举值) {
          if ((ev || '').toString().toLowerCase().includes(搜索关键词)) { 内容匹配 = true; break; }
        }
      }
      if (!内容匹配 && 原始.类型名 && 原始.类型名.toString().toLowerCase().includes(搜索关键词)) {
        内容匹配 = true;
      }
      if (!内容匹配 && 原始.已附加约定) {
        for (const cid of 原始.已附加约定) {
          const cn = 数据仓库.节点.get(cid);
          if (cn && (cn.名称 || '').toLowerCase().includes(搜索关键词)) { 内容匹配 = true; break; }
        }
      }
      // 成员函数名搜索（成员函数对象用"函数名"字段，非"名称"）
      if (!内容匹配) {
        const 成员函数列表 = 数据仓库.节点成员函数.get(n.id) || [];
        for (const mf of 成员函数列表) {
          const mfName = (mf.函数名 || mf.名称 || '').toString().toLowerCase();
          const mfDuty = (mf.职责 || '').toString().toLowerCase();
          if (mfName.includes(搜索关键词) || mfDuty.includes(搜索关键词)) { 内容匹配 = true; break; }
        }
      }
      // 成员变量名搜索（成员变量对象用"变量名"字段，非"名称"）
      if (!内容匹配) {
        const 成员变量列表 = 数据仓库.节点成员变量.get(n.id) || [];
        for (const mv of 成员变量列表) {
          const mvName = (mv.变量名 || mv.名称 || '').toString().toLowerCase();
          const mvDuty = (mv.职责 || '').toString().toLowerCase();
          if (mvName.includes(搜索关键词) || mvDuty.includes(搜索关键词)) { 内容匹配 = true; break; }
        }
      }
    }

    if (名称匹配) {
      名称匹配节点.push(n.id);
      try {
        const 状态 = 当前选中节点id === n.id ? ['选中', '名称匹配'] : ['名称匹配'];
        图.setElementState(n.id, 状态);
        搜索状态节点集合.add(n.id);
      } catch (e) {}
    } else if (内容匹配) {
      内容匹配节点.push(n.id);
      try {
        const 状态 = 当前选中节点id === n.id ? ['选中', '内容匹配'] : ['内容匹配'];
        图.setElementState(n.id, 状态);
        搜索状态节点集合.add(n.id);
      } catch (e) {}
    }
  }

  const 总匹配 = 名称匹配节点.length + 内容匹配节点.length;
  显示提示(`搜索匹配 ${总匹配} 个节点（名称 ${名称匹配节点.length}，内容 ${内容匹配节点.length}）`, 1500);

  // 第一个名称匹配节点（优先）或内容匹配节点聚焦到视图中心
  const 首个匹配 = 名称匹配节点[0] || 内容匹配节点[0];
  if (首个匹配) {
    try { 图.focusElement(首个匹配); } catch (e) {}
    const 第一个面板条目 = 面板容器.querySelector('.type-accordion[data-node-id="' + 首个匹配 + '"]');
    if (第一个面板条目) 第一个面板条目.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ==================== 面板过滤器 ====================

// 面板过滤状态：控制右侧节点列表显示哪些类别的节点
let 面板过滤 = '所有'; // '所有' | '分组' | '类型' | '函数' | '约定' | '枚举'

const 面板过滤按钮们 = document.querySelectorAll('#type-panel-filter .filter-btn');
面板过滤按钮们.forEach(按钮 => {
  按钮.addEventListener('click', () => {
    面板过滤 = 按钮.dataset.panelFilter;
    面板过滤按钮们.forEach(b => b.classList.toggle('on', b === 按钮));
    刷新类型面板();
    // 记录浏览历史（任务 #20）
    记录浏览历史(捕获当前状态());
  });
});

// ==================== 分组弹出层 ====================

const 分组弹出层 = document.createElement('div');
分组弹出层.id = 'group-popup';
分组弹出层.style.cssText = 'display:none;position:absolute;background:var(--bg,#fff);border:1px solid var(--border,#ddd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:6px 0;max-height:320px;overflow-y:auto;z-index:1000;min-width:180px;font-size:13px;';
document.body.appendChild(分组弹出层);

// 点击其他地方关闭分组弹出层
document.addEventListener('click', (ev) => {
  const 是分组按钮 = ev.target.dataset && ev.target.dataset.filter === '分组';
  if (!分组弹出层.contains(ev.target) && !是分组按钮) {
    分组弹出层.style.display = 'none';
  }
});

// 刷新分组弹出层内容（不切换显示状态）
function 刷新分组列表内容() {
  if (数据仓库.分组.size === 0) {
    分组弹出层.innerHTML = '<div style="padding:10px 16px;color:#999;">暂无分组</div>';
    return;
  }
  const 全部已激活 = 激活的分组.size === 数据仓库.分组.size;
  let html = `<div class="group-item group-select-all" style="padding:8px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#ddd);font-weight:600">
    <span>${全部已激活 ? '☑' : '🔲'} ${全部已激活 ? '全不选' : '全选'}</span>
    <span style="color:#999;font-size:11px;">${激活的分组.size}/${数据仓库.分组.size}</span>
  </div>`;
  const 项目列表 = Array.from(数据仓库.分组.entries()).map(([组名, 成员]) => {
    const 已激活 = 激活的分组.has(组名);
    return `<div class="group-item" data-group="${组名}" style="padding:8px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;${已激活 ? 'background:#fff7e6;' : ''}">
      <span>${已激活 ? '✅' : '⬜'} ${组名}</span>
      <span style="color:#999;font-size:11px;">${成员.size} 节点</span>
    </div>`;
  }).join('');
  分组弹出层.innerHTML = html + 项目列表;

  // 全选/全不选
  分组弹出层.querySelector('.group-select-all')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (全部已激活) {
      激活的分组.clear();
    } else {
      数据仓库.分组.forEach((_, 组名) => 激活的分组.add(组名));
    }
    const 分组按钮 = document.querySelector('.filter-btn[data-filter="分组"]');
    if (分组按钮) 分组按钮.classList.toggle('on', 激活的分组.size > 0);
    刷新视图();
    刷新分组列表内容();
  });

  // 单个组项点击
  分组弹出层.querySelectorAll('.group-item[data-group]').forEach(项 => {
    项.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const 组名 = 项.dataset.group;
      if (激活的分组.has(组名)) {
        激活的分组.delete(组名);
      } else {
        激活的分组.add(组名);
      }
      const 分组按钮 = document.querySelector('.filter-btn[data-filter="分组"]');
      if (分组按钮) 分组按钮.classList.toggle('on', 激活的分组.size > 0);
      刷新视图();
      刷新分组列表内容();
    });
    // hover 效果
    项.addEventListener('mouseenter', () => { 项.style.background = 项.style.background.includes('fff7e6') ? '#ffe7ba' : '#f5f5f5'; });
    项.addEventListener('mouseleave', () => { 项.style.background = 项.style.background.includes('ffe7ba') ? '#fff7e6' : ''; });
  });
}

function 弹出分组列表(触发按钮) {
  // 已显示则关闭（只在点击"组"按钮时切换）
  if (分组弹出层.style.display === 'block') {
    分组弹出层.style.display = 'none';
    return;
  }
  刷新分组列表内容();
  // 定位弹出层
  const rect = 触发按钮.getBoundingClientRect();
  分组弹出层.style.display = 'block';
  分组弹出层.style.left = rect.left + 'px';
  分组弹出层.style.top = (rect.bottom + 4) + 'px';
}

// 批量渲染合并：同步代码块内多次调用 刷新视图 只会触发一次实际渲染
// 解决大量 api.添加节点/添加边 调用时频繁 setData+render 导致的性能问题和 G6 状态混乱
let 渲染已排队 = false;
let 待刷新面板 = false;

/**
 * U12 测试规划视图：切换视图模式
 * - 普通视图：正常显示所有节点
 * - 测试规划视图：突出显示测试项，节点上显示测试数量角标，
 *   只显示类型和函数节点，隐藏成员函数/变量等细节
 */
function 切换视图模式(模式) {
  if (当前视图模式 === 模式) return;
  当前视图模式 = 模式;

  // 更新按钮样式
  const 普通视图按钮 = document.getElementById('view-mode-normal');
  const 测试规划按钮 = document.getElementById('view-mode-test');
  if (普通视图按钮 && 测试规划按钮) {
    if (模式 === '普通') {
      普通视图按钮.style.background = '#d4edda';
      普通视图按钮.style.fontWeight = 'bold';
      测试规划按钮.style.background = '';
      测试规划按钮.style.fontWeight = 'normal';
    } else {
      测试规划按钮.style.background = '#d4edda';
      测试规划按钮.style.fontWeight = 'bold';
      普通视图按钮.style.background = '';
      普通视图按钮.style.fontWeight = 'normal';
    }
  }

  刷新视图(true);
}

function 刷新视图(是否刷新面板 = false) {
  待刷新面板 = 待刷新面板 || 是否刷新面板;
  if (渲染已排队) return;

  渲染已排队 = true;
  queueMicrotask(执行刷新视图);
}

function 执行刷新视图() {
  渲染已排队 = false;
  const 需刷新面板 = 待刷新面板;
  待刷新面板 = false;

  // 首次渲染后同步项目下拉框（数据加载完成后才有项目名）
  刷新项目下拉框();

  const { 可见节点, 可见边 } = 计算可见元素();
  console.log('[X1] setData vis='+可见节点.length+' wh='+数据仓库.节点.size+' p='+需刷新面板);

  // 保存当前视图变换（缩放+平移）和节点拖拽位置，clear 后恢复
  // 防止 clear+render 重置用户手动调整的视角和拖拽的节点位置
  let 保存缩放 = null;
  let 保存位置 = null;
  try {
    保存缩放 = 图.getZoom();
    // 保存所有节点的当前位置（包括用户拖拽后的位置）
    const 当前节点数据 = 图.getNodeData();
    保存位置 = new Map();
    当前节点数据.forEach(n => {
      if (n.style && n.style.x !== undefined) {
        保存位置.set(n.id, { x: n.style.x, y: n.style.y });
      }
    });
  } catch(e) {}

  // clear 必须调用：setData 不带 clear 不会移除旧节点（隐藏子节点等功能失效）
  try { 图.clear(); } catch(e) {}

  // 全局错误防护：捕获 G6 异步渲染异常
  const _g6ErrorHandler = (e) => { if (e.message && e.message.includes('Node not found')) { e.preventDefault ? e.preventDefault() : (e.returnValue = false); console.warn('[安全] 拦截 G6 异步错误:', e.message); } };
  window.addEventListener('error', _g6ErrorHandler, true);
  // 移除旧监听避免重复
  if (window._g6ErrorHandlerOld) window.removeEventListener('error', window._g6ErrorHandlerOld, true);
  window._g6ErrorHandlerOld = _g6ErrorHandler;
  // 安全过滤：确保所有边都引用存在的节点，防止 G6 报错
  const 可见节点id集合 = new Set(可见节点.map(n => n.id));
  const 过滤后的边 = 可见边.filter(e => 可见节点id集合.has(e.source) && 可见节点id集合.has(e.target));
  if (过滤后的边.length !== 可见边.length) {
    console.warn('[安全] 过滤 ' + (可见边.length - 过滤后的边.length) + ' 条无效边');
  }

  // 将保存的拖拽位置合并到节点数据中，防止 dagre 重算导致位置归位
  if (保存位置 && 保存位置.size > 0) {
    可见节点.forEach(n => {
      const 保存 = 保存位置.get(n.id);
      if (保存) {
        if (!n.style) n.style = {};
        n.style.x = 保存.x;
        n.style.y = 保存.y;
      }
    });
  }

  try {
    图.setData({ nodes: 可见节点, edges: 过滤后的边 });
    图.render();
  } catch (e) {
    console.error('[安全] G6异常:', e.message);
  }

  // 恢复缩放（clear+render 会重置缩放到 1）
  if (保存缩放 && 保存缩放 > 0) {
    try { 图.zoomTo(保存缩放); } catch(e) {}
  }

  // 刷新视图后重新应用当前选中状态（clear 清除了所有状态）
  if (当前选中节点id) {
    const 临时选中id = 当前选中节点id;
    当前选中节点id = null;
    当前高亮边id集合.clear();
    设置画布节点选中(临时选中id);
  }
  if (需刷新面板) {
    刷新类型面板();
  }

  // 空状态处理：所有过滤器关闭 或 数据为空时显示提示
  const 空状态 = document.getElementById('empty-state');
  const 总节点 = 数据仓库.节点.size;
  if (总节点 === 0 || 可见节点.length === 0) {
    空状态.style.display = 'block';
    if (总节点 > 0 && 可见节点.length === 0) {
      空状态.querySelector('div:last-child').textContent = '请勾选上方过滤器以显示节点';
    } else {
      空状态.querySelector('div:last-child').textContent = '请勾选上方过滤器或等待 AI 填入工作数据';
    }
  } else {
    空状态.style.display = 'none';
  }
}

// ========== 边优先级表（需求10：多关系优先级去重） ==========
// 数值越小优先级越高
const 边优先级表 = {
  '拥有': 1,
  '继承': 2,
  '实现': 2,
  '符合约定': 3,
  '符合': 4,
  '调用': 5,
  '依赖': 6,
};

/**
 * 获取边的优先级数值
 * @param {string} 关系类型
 * @returns {number} 优先级数值，越小越高
 */
function 获取边优先级(关系类型) {
  return 边优先级表[关系类型] ?? 99;
}

/**
 * 应用边优先级去重（需求10）
 * 同一对节点之间有多条边时，只保留优先级最高的一条
 * @param {Array} 边列表
 * @returns {Array} 去重后的边列表
 */
function 应用边优先级去重(边列表) {
  const 边映射 = new Map(); // key: "source->target", value: 最高优先级的边
  
  for (const 边 of 边列表) {
    const key = `${边.source}->${边.target}`;
    const 现有 = 边映射.get(key);
    if (!现有) {
      边映射.set(key, 边);
    } else {
      const 新优先级 = 获取边优先级(边.关系类型);
      const 旧优先级 = 获取边优先级(现有.关系类型);
      if (新优先级 < 旧优先级) {
        边映射.set(key, 边);
      }
    }
  }
  
  return Array.from(边映射.values());
}

/**
 * 计算聚合依赖边（需求9：子节点折叠时父类型聚合显示依赖边）
 * 当成员函数/成员变量被隐藏时，将它们的出边（非拥有关系）聚合到父类型节点
 * @param {Set} 可见节点id - 当前可见的节点 id 集合
 * @param {Array} 当前所有边 - 所有边的扁平列表
 * @returns {Array} 聚合边列表
 */
function 计算聚合依赖边(可见节点id, 当前所有边) {
  const 聚合边映射 = new Map(); // key: "父id->目标id", value: 最高优先级的聚合边
  
  for (const 边 of 当前所有边) {
    const 源分类 = 节点分类.get(边.source);
    
    // 只处理成员函数和成员变量的出边
    if (源分类 !== '成员函数' && 源分类 !== '成员变量') continue;
    
    // 如果源节点可见，不需要聚合
    if (可见节点id.has(边.source)) continue;
    
    // 跳过拥有关系（拥有关系是父→子，反向不需要聚合）
    if (边.关系类型 === '拥有') continue;
    
    // 如果目标节点不可见，也不需要聚合
    if (!可见节点id.has(边.target)) continue;
    
    // 计算父节点 id（去掉最后一个 . 后面的部分）
    const 点索引 = 边.source.lastIndexOf('.');
    if (点索引 < 0) continue;
    const 父id = 边.source.substring(0, 点索引);
    
    // 如果父节点不可见，跳过
    if (!可见节点id.has(父id)) continue;
    
    // 聚合 key：父id -> 目标id
    const 聚合key = `${父id}->${边.target}`;
    const 优先级 = 获取边优先级(边.关系类型);
    const 现有 = 聚合边映射.get(聚合key);
    
    if (!现有) {
      聚合边映射.set(聚合key, {
        source: 父id,
        target: 边.target,
        关系类型: 边.关系类型,
        标签: 边.标签 || '',
        _聚合边: true,
        states: [边.关系类型]
      });
    } else {
      // 按优先级保留最高的
      if (优先级 < 获取边优先级(现有.关系类型)) {
        聚合边映射.set(聚合key, {
          source: 父id,
          target: 边.target,
          关系类型: 边.关系类型,
          标签: 边.标签 || '',
          _聚合边: true,
          states: [边.关系类型]
        });
      }
    }
  }
  
  return Array.from(聚合边映射.values());
}

function 计算可见元素() {
  const 当前所有节点 = Array.from(数据仓库.节点.values());
  // 将边数组展开为扁平列表（同一对节点可能有多条不同类型的边）
  const 当前所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) {
    for (const 边 of 边数组) {
      当前所有边.push(边);
    }
  }
  const 可见节点id = new Set();

  // 聚焦模式：只显示聚焦节点及其子节点
  // 组节点聚焦：显示该组所有成员及其相互之间的边
  // 聚焦深度=1：只看直接子节点；聚焦深度=-1：递归展开所有子孙节点（带环检测）
  if (聚焦节点) {
    if (聚焦节点.startsWith('组::')) {
      // 组节点聚焦：将组内所有成员加入可见集合
      const 组名 = 聚焦节点.substring(3);
      const 组成员 = 数据仓库.分组.get(组名);
      if (组成员) {
        组成员.forEach(id => 可见节点id.add(id));
        // 递归展开：显示组内成员的所有子孙节点（任务 #15）
        if (聚焦深度 === -1) {
          const 已访问 = new Set(组成员);
          const 待遍历 = Array.from(组成员);
          while (待遍历.length > 0) {
            const 当前 = 待遍历.shift();
            当前所有边.forEach(e => {
              if (e.source === 当前 && !已访问.has(e.target)) {
                已访问.add(e.target);
                可见节点id.add(e.target);
                待遍历.push(e.target);
              }
            });
          }
        }
      }
    } else {
      // 普通节点聚焦：显示节点及其子节点
      可见节点id.add(聚焦节点);
      if (聚焦深度 === 1) {
        // 只看直接子节点
        当前所有边.forEach(e => {
          if (e.source === 聚焦节点) 可见节点id.add(e.target);
        });
      } else if (聚焦深度 === -1) {
        // 递归展开所有子孙节点，带环检测
        const 已访问 = new Set([聚焦节点]);
        const 待遍历 = [聚焦节点];
        while (待遍历.length > 0) {
          const 当前 = 待遍历.shift();
          当前所有边.forEach(e => {
            if (e.source === 当前 && !已访问.has(e.target)) {
              已访问.add(e.target);
              可见节点id.add(e.target);
              待遍历.push(e.target);
            }
          });
        }
      }
    }
    // 组节点显示成员间所有边；普通节点聚焦深度=1 只显示从聚焦节点出发的边；聚焦深度=-1 显示子孙间所有边
    const 是组聚焦 = 聚焦节点.startsWith('组::');
    const 是递归聚焦 = 聚焦深度 === -1;
    let 可见边 = 当前所有边.filter(e => {
      if (!可见节点id.has(e.source) || !可见节点id.has(e.target)) return false;
      if (是组聚焦 || 是递归聚焦) return true; // 组聚焦或递归聚焦：显示成员间所有边
      return e.source === 聚焦节点; // 普通聚焦：只显示从聚焦节点出发的边
    });

    // 聚焦模式下也应用过滤器筛选（任务 #23）
    // 聚焦节点本身始终显示，其他节点根据过滤器状态筛选
    // 任务 #24：隐藏节点集合中的节点不显示（聚焦节点本身除外）
    // 任务 #27：强制显示集合优先于全局过滤器（突破全局隐藏）
    const 聚焦组成员 = 是组聚焦 ? 数据仓库.分组.get(聚焦节点.substring(3)) : null;
    const 过滤后节点id = new Set();
    可见节点id.forEach(id => {
      if (id === 聚焦节点) { 过滤后节点id.add(id); return; }
      // 任务 #24：用户手动隐藏的节点跳过
      if (隐藏节点集合.has(id)) return;
      // 组节点聚焦时，组成员也始终显示
      if (聚焦组成员?.has(id)) { 过滤后节点id.add(id); return; }
      // 任务 #27：强制显示集合突破全局过滤器
      if (强制显示集合.has(id)) { 过滤后节点id.add(id); return; }
      const 分类 = 节点分类.get(id);
      // U12 测试规划视图：只显示类型、函数、约定节点
      if (当前视图模式 === '测试规划') {
        if (分类 === '类型') 过滤后节点id.add(id);
        else if (分类 === '函数') 过滤后节点id.add(id);
        else if (分类 === '约定') 过滤后节点id.add(id);
        return;
      }
      if (分类 === '类型' && 过滤器['类型']) 过滤后节点id.add(id);
      else if (分类 === '函数' && 过滤器['函数']) 过滤后节点id.add(id);
      else if (分类 === '成员函数' && 过滤器['成员函数']) 过滤后节点id.add(id);
      else if (分类 === '变量' && 过滤器['变量']) 过滤后节点id.add(id);
      else if (分类 === '成员变量' && 过滤器['成员变量']) 过滤后节点id.add(id);
      else if (分类 === '枚举' && 过滤器['枚举']) 过滤后节点id.add(id);
      else if (分类 === '约定' && 过滤器['约定']) 过滤后节点id.add(id);
    });

    // 跨项目过滤（聚焦模式）：只保留属于当前所选项目的节点
    for (const id of Array.from(过滤后节点id)) {
      if (!是否属于过滤项目(id)) 过滤后节点id.delete(id);
    }
    // 边缘显示（聚焦模式）：补充当前项目直接依赖的外部项目节点（仅可见）
    边缘只读节点集合 = 计算边缘只读节点(过滤后节点id);
    边缘只读节点集合.forEach(id => 过滤后节点id.add(id));

    // 边也应用过滤器
    可见边 = 可见边.filter(e => {
      if (!过滤后节点id.has(e.source) || !过滤后节点id.has(e.target)) return false;
      const 类型 = e.关系类型 || '拥有';
      if (!过滤器[类型]) return false;
      return true;
    });

    let 可见节点 = 当前所有节点.filter(n => 过滤后节点id.has(n.id));
    可见节点 = 可见节点.map(n => {
      const 原始 = 数据仓库.节点.get(n.id);
      const 置信度 = 原始?.置信度 || '中';
      const states = [原始?.类型 || 'class', '置信度' + 置信度];
      if (原始?.已附加约定?.length) states.push('已附加约定');
      if (边缘只读节点集合.has(n.id)) states.push('边缘只读');
      if (n.id === 当前高亮节点) states.push('选中');
      // U12 测试规划视图：添加测试项数量角标
      let 显示名称 = 原始?.名称 || n.id;
      // 变量节点显示类型名前缀
      if ((原始?.类型 === 'variable' || 原始?.类型 === 'membervar') && 原始?.类型名) {
        显示名称 = `${原始.类型名} ${显示名称}`;
      }
      const 测试数量 = 原始?._测试项?.length || 0;
      if (测试数量 > 0) {
        显示名称 = 显示名称 + `  🧪${测试数量}`;
      }
      return { ...n, 名称: 显示名称, nodeType: 原始?.类型 || 'class', confidence: 置信度, states };
    });
    可见边 = 可见边.map(e => {
      const 类型 = e.关系类型 || '拥有';
      const result = { ...e, 标签: e.标签 || '' };
      if (类型 !== '拥有') result.states = [类型];
      return result;
    });
    
    // 需求9：子节点折叠时，父类型聚合显示依赖边
    const 聚合边 = 计算聚合依赖边(过滤后节点id, 当前所有边);
    可见边 = 可见边.concat(聚合边);
    
    // 需求10：多关系优先级去重（同一对节点只显示优先级最高的边）
    可见边 = 应用边优先级去重(可见边);
    
    return { 可见节点, 可见边 };
  }

  const 约定节点集 = new Set();
  if (过滤器['约定']) {
    当前所有节点.forEach(n => {
      const 原始 = 数据仓库.节点.get(n.id);
      if (原始?.是约定类型) 约定节点集.add(n.id);
    });
    当前所有边.forEach(e => {
      if (e.关系类型 === '符合约定') {
        约定节点集.add(e.target); // 约定类型端总是加入
        const sc = 节点分类.get(e.source);
        if ((sc === '类型' && 过滤器['类型']) || (sc === '函数' && 过滤器['函数']) || (sc === '成员函数' && 过滤器['成员函数']) || (sc === '枚举' && 过滤器['枚举'])) 约定节点集.add(e.source);
      }
    });
  }

  当前所有节点.forEach(n => {
    const 分类 = 节点分类.get(n.id);
    // U12 测试规划视图：只显示类型、函数、约定节点
    if (当前视图模式 === '测试规划') {
      if (分类 === '类型') 可见节点id.add(n.id);
      if (分类 === '函数') 可见节点id.add(n.id);
      if (分类 === '约定') 可见节点id.add(n.id);
      // 成员函数/变量在测试规划视图下不显示，聚合到父类型
      return;
    }
    if (分类 === '类型' && 过滤器['类型']) 可见节点id.add(n.id);
    if (分类 === '函数' && 过滤器['函数']) 可见节点id.add(n.id);
    if (分类 === '成员函数' && 过滤器['成员函数']) 可见节点id.add(n.id);
    if (分类 === '变量' && 过滤器['变量']) 可见节点id.add(n.id);
    if (分类 === '成员变量' && 过滤器['成员变量']) 可见节点id.add(n.id);
    if (分类 === '枚举' && 过滤器['枚举']) 可见节点id.add(n.id);
    if (分类 === '约定' && 过滤器['约定']) 可见节点id.add(n.id);
  });

  // 任务 #27：强制显示集合优先于全局过滤器（突破全局隐藏）
  // 例如全局隐藏"成员函数"，但节点过滤器单独让某节点的成员函数显示
  强制显示集合.forEach(id => 可见节点id.add(id));

  // 任务 #24：从可见节点中移除用户手动隐藏的节点
  隐藏节点集合.forEach(id => 可见节点id.delete(id));

  // 跨项目过滤：只保留属于当前所选项目的节点（默认仅当前项目）
  for (const id of Array.from(可见节点id)) {
    if (!是否属于过滤项目(id)) 可见节点id.delete(id);
  }
  // 边缘显示（普通模式）：补充当前项目直接依赖的外部项目节点（仅可见、不可操作）
  边缘只读节点集合 = 计算边缘只读节点(可见节点id);
  边缘只读节点集合.forEach(id => 可见节点id.add(id));

  let 可见边 = 当前所有边.filter(e => {
    const 类型 = e.关系类型 || '拥有';
    if (!过滤器[类型]) return false;
    const 源分类 = 节点分类.get(e.source);
    const 目标分类 = 节点分类.get(e.target);
    if ((源分类 === '枚举' && !过滤器['枚举']) || (目标分类 === '枚举' && !过滤器['枚举'])) return false;
    return 可见节点id.has(e.source) && 可见节点id.has(e.target);
  });

  let 可见节点 = 当前所有节点.filter(n => 可见节点id.has(n.id));
  可见节点 = 可见节点.map(n => {
    const 原始 = 数据仓库.节点.get(n.id);
    const 置信度 = 原始?.置信度 || '中';
    const states = [原始?.类型 || 'class', `置信度${置信度}`];
    if (边缘只读节点集合.has(n.id)) states.push('边缘只读');
    if (n.id === 当前高亮节点) states.push('选中');
    // U12 测试规划视图：添加测试项数量角标
    let 显示名称 = 原始?.名称 || n.id;
    // 变量节点显示类型名前缀
    if ((原始?.类型 === 'variable' || 原始?.类型 === 'membervar') && 原始?.类型名) {
      显示名称 = `${原始.类型名} ${显示名称}`;
    }
    const 测试数量 = 原始?._测试项?.length || 0;
    if (测试数量 > 0) {
      显示名称 = 显示名称 + `  🧪${测试数量}`;
    }
    return { ...n, 名称: 显示名称, nodeType: 原始?.类型 || 'class', confidence: 置信度, states };
  });

  可见边 = 可见边.map(e => {
    const 类型 = e.关系类型 || '拥有';
    const result = { ...e, 标签: e.标签 || '' };
    if (类型 !== '拥有') result.states = [类型];
    return result;
  });

  // 需求9：子节点折叠时，父类型聚合显示依赖边
  const 聚合边 = 计算聚合依赖边(可见节点id, 当前所有边);
  可见边 = 可见边.concat(聚合边);

  // 需求10：多关系优先级去重（同一对节点只显示优先级最高的边）
  可见边 = 应用边优先级去重(可见边);

  // ========== 分组折叠处理 ==========
  // 当激活的分组非空时，将每组可见成员折叠为单个"组节点"
  // 组内边隐藏，跨组/外部边端点替换为组节点，多条合并边去重
  if (激活的分组.size > 0) {
    // 节点 -> 所属激活组名（取第一个匹配的组）
    const 节点到组 = new Map();
    激活的分组.forEach(组名 => {
      const 成员 = 数据仓库.分组.get(组名);
      if (!成员) return;
      成员.forEach(id => {
        if (!节点到组.has(id)) 节点到组.set(id, 组名);
      });
    });

    // 收集每个激活组的可见成员
    const 组可见成员 = new Map(); // 组名 -> [可见节点id...]
    可见节点id.forEach(id => {
      const 组名 = 节点到组.get(id);
      if (!组名) return;
      if (!组可见成员.has(组名)) 组可见成员.set(组名, []);
      组可见成员.get(组名).push(id);
    });

    // 若某组无可见成员则跳过（不创建空组节点）
    // 任务 #24：若组节点本身被用户隐藏（组::组名 在 隐藏节点集合 中），也跳过
    const 被隐藏的节点 = new Set();
    const 组节点列表 = [];
    组可见成员.forEach((成员列表, 组名) => {
      // 任务 #24：组节点被隐藏时跳过整个组
      if (隐藏节点集合.has(`组::${组名}`)) {
        成员列表.forEach(id => 被隐藏的节点.add(id));
        return;
      }
      成员列表.forEach(id => 被隐藏的节点.add(id));
      组节点列表.push({
        id: `组::${组名}`,
        名称: 组名,
        nodeType: 'group',
        成员数: 成员列表.length,
        成员: 成员列表,
        states: ['group'],
      });
    });

    if (组节点列表.length > 0) {
      // 重定向边：组内边隐藏，跨组/外部边端点替换为组节点
      const 边去重 = new Set();
      const 新可见边 = [];
      可见边.forEach(e => {
        let 新源 = e.source;
        let 新目标 = e.target;
        const 源组 = 节点到组.get(e.source);
        const 目标组 = 节点到组.get(e.target);
        // 同组内部边：隐藏
        if (源组 && 目标组 && 源组 === 目标组) return;
        if (源组) 新源 = `组::${源组}`;
        if (目标组) 新目标 = `组::${目标组}`;
        // 自环：跳过
        if (新源 === 新目标) return;
        // 去重：同方向同端点只保留一条
        const 边key = `${新源}->${新目标}`;
        if (边去重.has(边key)) return;
        边去重.add(边key);
        新可见边.push({ ...e, source: 新源, target: 新目标 });
      });
      可见边 = 新可见边;

      // 移除被隐藏的节点，添加组节点
      可见节点 = 可见节点.filter(n => !被隐藏的节点.has(n.id));
      可见节点 = 可见节点.concat(组节点列表);
    }
  }

  return { 可见节点, 可见边 };
}

// ==================== 右侧类型列表面板 ====================

const 面板容器 = document.getElementById('type-panel-list');
const 类型计数 = document.getElementById('type-count');
const 类型面板 = document.getElementById('type-panel');
const 面板切换按钮 = document.getElementById('panel-toggle');
const 分隔线 = document.getElementById('panel-resizer');

// ==================== 浏览历史（撤回/重做 — 任务 #20） ====================
// 记录用户在右侧面板的浏览轨迹：展开/折叠节点、切换过滤器、点击成员函数行等
// 两个箭头按钮 ← / → 分别撤回和重做，类似浏览器的前进/后退
let 浏览历史 = [];
let 历史指针 = -1;
const 最大历史 = 50;
// 标记：恢复历史时不再记录新历史，避免循环
let 正在恢复历史 = false;

/** 捕获当前面板状态为一个历史快照 */
function 捕获当前状态() {
  const 展开节点 = [];
  const 展开分组 = [];
  面板容器.querySelectorAll('.type-accordion.open').forEach(item => {
    if (item.dataset.nodeId) 展开节点.push(item.dataset.nodeId);
    else if (item.dataset.groupName) 展开分组.push(item.dataset.groupName);
  });
  return {
    面板过滤,
    // 项目过滤：null=当前项目，size=0=全部，否则为所选项目
    项目过滤: 项目过滤集合 === null ? null : (项目过滤集合.size === 0 ? [] : Array.from(项目过滤集合)),
    展开节点,
    展开分组,
    高亮节点: 当前高亮节点,
    滚动位置: 面板容器.scrollTop,
  };
}

/** 记录一条浏览历史（在用户操作完成后调用） */
function 记录浏览历史(状态) {
  if (正在恢复历史) return;
  // 截断指针之后的历史（用户执行新操作时丢弃 redo 部分）
  浏览历史 = 浏览历史.slice(0, 历史指针 + 1);
  浏览历史.push(状态);
  if (浏览历史.length > 最大历史) {
    浏览历史.shift();
  } else {
    历史指针++;
  }
  更新历史按钮状态();
}

/** 根据指针更新撤回/重做按钮的可用状态 */
function 更新历史按钮状态() {
  const 撤回按钮 = document.getElementById('btn-undo');
  const 重做按钮 = document.getElementById('btn-redo');
  if (撤回按钮) {
    撤回按钮.disabled = 历史指针 <= 0;
    撤回按钮.style.opacity = 撤回按钮.disabled ? '0.4' : '1';
    撤回按钮.style.cursor = 撤回按钮.disabled ? 'not-allowed' : 'pointer';
    撤回按钮.style.color = 撤回按钮.disabled ? 'var(--text-muted)' : 'var(--accent)';
  }
  if (重做按钮) {
    重做按钮.disabled = 历史指针 >= 浏览历史.length - 1;
    重做按钮.style.opacity = 重做按钮.disabled ? '0.4' : '1';
    重做按钮.style.cursor = 重做按钮.disabled ? 'not-allowed' : 'pointer';
    重做按钮.style.color = 重做按钮.disabled ? 'var(--text-muted)' : 'var(--accent)';
  }
}

/** 恢复到指定历史快照 */
function 恢复历史状态(状态) {
  正在恢复历史 = true;
  try {
    // 恢复面板过滤
    面板过滤 = 状态.面板过滤;
    面板过滤按钮们.forEach(b => b.classList.toggle('on', b.dataset.panelFilter === 面板过滤));
    刷新类型面板();
    // 恢复项目过滤
    const 历史项目过滤 = 状态.项目过滤;
    if (历史项目过滤 === null) {
      项目过滤集合 = null;
    } else if (Array.isArray(历史项目过滤) && 历史项目过滤.length === 0) {
      项目过滤集合 = new Set();
    } else if (Array.isArray(历史项目过滤)) {
      项目过滤集合 = new Set(历史项目过滤);
    }
    刷新项目下拉框();
    // 恢复展开状态
    面板容器.querySelectorAll('.type-accordion').forEach(item => {
      const id = item.dataset.nodeId;
      const 组名 = item.dataset.groupName;
      let 应展开 = false;
      if (id) 应展开 = 状态.展开节点.includes(id);
      else if (组名) 应展开 = 状态.展开分组.includes(组名);
      item.classList.toggle('open', 应展开);
    });
    // 恢复高亮节点
    当前高亮节点 = 状态.高亮节点;
    刷新视图();
    // 恢复滚动位置（下一帧执行，等 DOM 更新完成）
    requestAnimationFrame(() => { 面板容器.scrollTop = 状态.滚动位置 || 0; });
  } finally {
    正在恢复历史 = false;
  }
}

/** 撤回：回到上一个浏览状态 */
function 撤回() {
  if (历史指针 <= 0) return;
  历史指针--;
  恢复历史状态(浏览历史[历史指针]);
  更新历史按钮状态();
  显示提示('撤回', 800);
}

/** 重做：前进到下一个浏览状态 */
function 重做() {
  if (历史指针 >= 浏览历史.length - 1) return;
  历史指针++;
  恢复历史状态(浏览历史[历史指针]);
  更新历史按钮状态();
  显示提示('重做', 800);
}

// 绑定按钮事件（按钮在 初始化UI 中创建）
document.addEventListener('DOMContentLoaded', () => {
  const 撤回按钮 = document.getElementById('btn-undo');
  const 重做按钮 = document.getElementById('btn-redo');
  if (撤回按钮) 撤回按钮.addEventListener('click', 撤回);
  if (重做按钮) 重做按钮.addEventListener('click', 重做);
});
// 由于 初始化UI 在脚本顶部已执行，按钮此时已存在，直接绑定
(() => {
  const 撤回按钮 = document.getElementById('btn-undo');
  const 重做按钮 = document.getElementById('btn-redo');
  if (撤回按钮) 撤回按钮.addEventListener('click', 撤回);
  if (重做按钮) 重做按钮.addEventListener('click', 重做);
})();

function 同步分隔线位置() {
  const 图例 = document.getElementById('legend');
  const 触摸提示 = document.getElementById('touch-hint');
  if (面板在底部) {
    const h = parseInt(类型面板.style.height) || 260;
    分隔线.style.bottom = h + 'px';
    图例.style.bottom = (h + 12) + 'px';
    触摸提示.style.bottom = (h + 12) + 'px';
  } else {
    分隔线.style.right = (parseInt(类型面板.style.width) || 330) + 'px';
    图例.style.bottom = '12px';
    触摸提示.style.bottom = '12px';
  }
  更新自适应布局();
}

function 更新自适应布局() {
  const w = 类型面板.getBoundingClientRect().width;
  类型面板.classList.toggle('wide', w >= 420);
  const was500 = 类型面板.dataset.was500 === '1';
  const is500 = w >= 500;
  const was340 = 类型面板.dataset.was340 === '1';
  const is340 = w >= 340;
  if (was500 !== is500 || was340 !== is340) {
    类型面板.dataset.was500 = is500 ? '1' : '0';
    类型面板.dataset.was340 = is340 ? '1' : '0';
    刷新类型面板();
  }
}

// ========== 内联展开开关 ==========
const 内联开关 = document.getElementById('inline-toggle');
let 内联模式 = false;
内联开关.addEventListener('click', () => {
  内联模式 = !内联模式;
  内联开关.classList.toggle('active', 内联模式);
  内联开关.textContent = 内联模式 ? '⊞ 内联·开' : '⊞ 内联';
  关闭内联浮层();
});

// ========== 面板位置切换 ==========
const 面板位置按钮 = document.getElementById('panel-pos-toggle');
let 面板在底部 = false;
面板位置按钮.addEventListener('click', () => {
  面板在底部 = !面板在底部;
  document.body.classList.toggle('panel-bottom', 面板在底部);
  面板位置按钮.textContent = 面板在底部 ? '⬆' : '⬇';
  类型面板.style.width = ''; 类型面板.style.height = '';
  分隔线.style.right = ''; 分隔线.style.bottom = '';
  const 图例 = document.getElementById('legend');
  const 触摸提示 = document.getElementById('touch-hint');
  if (面板在底部) {
    图例.style.bottom = '272px'; 触摸提示.style.bottom = '272px';
  } else {
    图例.style.bottom = '12px'; 触摸提示.style.bottom = '12px';
  }
  同步分隔线位置();
});
同步分隔线位置();

// ========== 拖拽分隔线 ==========
let 拖拽中 = false;

分隔线.addEventListener('mousedown', (e) => { 拖拽中 = true; 分隔线.classList.add('dragging'); e.preventDefault(); });
document.addEventListener('mousemove', (e) => {
  if (!拖拽中) return;
  const 图例 = document.getElementById('legend');
  const 触摸提示 = document.getElementById('touch-hint');
  if (面板在底部) {
    const h = window.innerHeight - e.clientY;
    if (h > 100 && h < window.innerHeight - 100) {
      类型面板.style.height = h + 'px';
      分隔线.style.bottom = h + 'px';
      图例.style.bottom = (h + 12) + 'px';
      触摸提示.style.bottom = (h + 12) + 'px';
    }
  } else {
    const w = window.innerWidth - e.clientX;
    if (w > 180 && w < window.innerWidth - 200) {
      类型面板.style.width = w + 'px';
      分隔线.style.right = w + 'px';
      图例.style.bottom = '12px';
      触摸提示.style.bottom = '12px';
    }
  }
  更新自适应布局();
});
document.addEventListener('mouseup', () => { 拖拽中 = false; 分隔线.classList.remove('dragging'); });

// ========== 面板伸缩按钮 ==========
let 保存的宽度 = '', 保存的高度 = '', 保存的分隔右 = '', 保存的分隔底 = '';
面板切换按钮.addEventListener('click', () => {
  const 图例 = document.getElementById('legend');
  const 触摸提示 = document.getElementById('touch-hint');
  类型面板.classList.toggle('collapsed');
  if (类型面板.classList.contains('collapsed')) {
    保存的宽度 = 类型面板.style.width; 保存的高度 = 类型面板.style.height;
    保存的分隔右 = 分隔线.style.right; 保存的分隔底 = 分隔线.style.bottom;
    类型面板.style.width = ''; 类型面板.style.height = '';
    分隔线.style.right = ''; 分隔线.style.bottom = '';
    图例.style.bottom = '12px'; 触摸提示.style.bottom = '12px';
  } else {
    if (面板在底部 && 保存的高度) {
      类型面板.style.height = 保存的高度;
      分隔线.style.bottom = 保存的分隔底;
      图例.style.bottom = (parseInt(保存的高度) + 12) + 'px';
      触摸提示.style.bottom = (parseInt(保存的高度) + 12) + 'px';
    } else if (!面板在底部 && 保存的宽度) {
      类型面板.style.width = 保存的宽度;
      分隔线.style.right = 保存的分隔右;
      图例.style.bottom = '12px'; 触摸提示.style.bottom = '12px';
    } else {
      同步分隔线位置();
    }
  }
  面板切换按钮.textContent = 类型面板.classList.contains('collapsed') ? '▶ 展开面板' : '◀ 折叠面板';
});

/** 刷新右侧面板 */
function 刷新类型面板() {
  console.log('[X2] panelRefresh wh='+数据仓库.节点.size+' filter='+面板过滤);
  // 计算节点到分组的反向索引：节点id -> Set<组名>
  const 节点到分组 = new Map();
  数据仓库.分组.forEach((成员, 组名) => {
    成员.forEach(id => {
      if (!id.startsWith('组::')) {
        if (!节点到分组.has(id)) 节点到分组.set(id, new Set());
        节点到分组.get(id).add(组名);
      }
    });
  });

  // 获取所有非成员函数/成员变量节点（这两类不在右侧列表作为独立条目显示）
  // 成员函数和成员变量通过父类型的展开详情中的表格展示
  const 所有节点 = Array.from(数据仓库.节点.values())
    .filter(n => 节点分类.get(n.id) !== '成员函数' && 节点分类.get(n.id) !== '成员变量')
    // 跨项目过滤：默认只显示当前项目节点
    .filter(n => 是否属于过滤项目(n.id))
    .sort((a, b) => {
      // 按分类优先级排序：类型 > 枚举 > 约定 > 函数 > 变量
      const 优先级 = { '类型': 0, '枚举': 1, '约定': 2, '函数': 3, '变量': 4 };
      const pa = 优先级[节点分类.get(a.id)] ?? 5;
      const pb = 优先级[节点分类.get(b.id)] ?? 5;
      if (pa !== pb) return pa - pb;
      return (a.名称 || a.id).localeCompare(b.名称 || b.id, 'zh');
    });

  console.log('[X3] allNodes n='+所有节点.length+' ids='+所有节点.map(x=>x.id).join(','));
  // 根据面板过滤状态筛选节点
  let 显示节点 = [];
  let 显示组 = false;
  if (面板过滤 === '所有') {
    显示节点 = 所有节点;
    显示组 = true;
  } else if (面板过滤 === '分组') {
    显示组 = true;
  } else if (面板过滤 === '类型') {
    显示节点 = 所有节点.filter(n => 节点分类.get(n.id) === '类型');
  } else if (面板过滤 === '函数') {
    显示节点 = 所有节点.filter(n => 节点分类.get(n.id) === '函数');
  } else if (面板过滤 === '变量') {
    显示节点 = 所有节点.filter(n => 节点分类.get(n.id) === '变量');
  } else if (面板过滤 === '约定') {
    显示节点 = 所有节点.filter(n => 节点分类.get(n.id) === '约定');
  } else if (面板过滤 === '枚举') {
    显示节点 = 所有节点.filter(n => 节点分类.get(n.id) === '枚举');
  } else if (面板过滤 === '测试') {
    显示节点 = 所有节点.filter(n => {
      const 测试项 = (数据仓库.节点.get(n.id) || {})._测试项 || [];
      return 测试项.length > 0;
    });
  }

  // 搜索筛选：若有搜索关键词，在面板过滤基础上进一步筛选
  // 名称匹配的节点排前面，内容匹配的节点排后面
  if (搜索关键词) {
    const 名称匹配列表 = [];
    const 内容匹配列表 = [];
    for (const n of 显示节点) {
      const 名称 = (n.名称 || n.id || '').toString().toLowerCase();
      const ID = (n.id || '').toString().toLowerCase();
      if (名称.includes(搜索关键词) || ID.includes(搜索关键词)) {
        名称匹配列表.push(n);
      } else {
        // 检查内容匹配（签名、枚举值、成员函数名、成员变量名等）
        let 内容命中 = false;
        const 原始 = 数据仓库.节点.get(n.id) || n;
        if (原始.签名 && 原始.签名.toString().toLowerCase().includes(搜索关键词)) 内容命中 = true;
        if (!内容命中 && 原始.枚举值) {
          for (const ev of 原始.枚举值) {
            if ((ev || '').toString().toLowerCase().includes(搜索关键词)) { 内容命中 = true; break; }
          }
        }
        if (!内容命中 && 原始.类型名 && 原始.类型名.toString().toLowerCase().includes(搜索关键词)) 内容命中 = true;
        if (!内容命中) {
          const 成员函数列表 = 数据仓库.节点成员函数.get(n.id) || [];
          for (const mf of 成员函数列表) {
            const mfName = (mf.函数名 || mf.名称 || '').toString().toLowerCase();
            const mfDuty = (mf.职责 || '').toString().toLowerCase();
            if (mfName.includes(搜索关键词) || mfDuty.includes(搜索关键词)) { 内容命中 = true; break; }
          }
        }
        if (!内容命中) {
          const 成员变量列表 = 数据仓库.节点成员变量.get(n.id) || [];
          for (const mv of 成员变量列表) {
            const mvName = (mv.变量名 || mv.名称 || '').toString().toLowerCase();
            const mvDuty = (mv.职责 || '').toString().toLowerCase();
            if (mvName.includes(搜索关键词) || mvDuty.includes(搜索关键词)) { 内容命中 = true; break; }
          }
        }
        if (内容命中) 内容匹配列表.push(n);
      }
    }
    // 名称匹配在前，内容匹配在后
    显示节点 = 名称匹配列表.concat(内容匹配列表);
    // 搜索时隐藏分组条目（分组不参与搜索筛选）
    显示组 = false;
  }

  const 总数 = 显示节点.length + (显示组 ? 数据仓库.分组.size : 0);
  类型计数.textContent = `(${总数})`;
  const 面板宽 = 类型面板.getBoundingClientRect().width;

  let html = '';

  // 渲染组条目（显示在列表顶部）
  if (显示组 && 数据仓库.分组.size > 0) {
    数据仓库.分组.forEach((成员, 组名) => {
      html += `<div class="type-accordion group-accordion" data-group-name="${组名}">`;
      html += `<div class="type-accordion-header" onclick="切换组折叠('${组名}')">`;
      html += `<span class="type-accordion-name">▶ <span>📦 ${组名}</span> <span class="group-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;background:#fff7e6;color:#e67e22;border:1px solid #e67e22">组</span></span>`;
      html += `<span style="font-size:13px;color:var(--text-secondary);text-align:right">${成员.size} 个成员</span>`;
      html += `</div>`;
      html += `<div class="type-accordion-body">`;
      html += '<div class="type-detail-section"><h5>📋 组成员</h5>';
      html += '<table class="type-detail-table"><tr><th>名称</th><th>类型</th></tr>';
      const 可见组成员 = Array.from(成员).filter(id => 是否属于过滤项目(id));
      if (可见组成员.length === 0) {
        html += '<tr><td colspan="2" style="color:var(--text-muted);text-align:center">当前项目过滤下无成员</td></tr>';
      } else {
        可见组成员.forEach(id => {
        if (id.startsWith('组::')) {
          const 引用组名 = id.substring(3);
          // 任务 #26：点击组引用行跳转到对应组条目
          html += `<tr style="cursor:pointer" onclick="跳转组成员('${id.replace(/'/g, "\\'")}')" title="点击跳转到此组"><td>📦 ${引用组名}</td><td>组</td></tr>`;
        } else {
          const n = 数据仓库.节点.get(id);
          if (n) {
            // 任务 #26：点击成员行跳转到对应节点并展开
            html += `<tr style="cursor:pointer" onclick="跳转组成员('${id.replace(/'/g, "\\'")}')" title="点击跳转到此节点"><td><strong>${n.名称 || id}</strong></td><td>${n.类型 || '—'}</td></tr>`;
          }
        }
      });
      }
      html += '</table></div>';
      html += `</div></div>`;
    });
  }

  // 渲染节点条目（按分组归类）
  if (显示节点.length > 0) {
    const 已处理 = new Set();

    // 按分组归类：遍历所有分组，为每个分组渲染标题 + 该组的节点
  节点到分组.forEach((组集合, 节点id) => {
      const 节点数据 = 数据仓库.节点.get(节点id);
      if (!节点数据) return;
      if (!显示节点.includes(节点数据)) return;
      if (已处理.has(节点id)) return;

      // 取第一个组名作为分组标题
      const 组名 = Array.from(组集合)[0];
      html += `<div class="group-separator" style="padding:6px 12px;font-size:11px;color:var(--text-muted);background:var(--surface-hover);font-weight:600">📦 ${组名}</div>`;

      // 添加该组所有在显示范围内的节点
      数据仓库.分组.get(组名).forEach(成员id => {
        if (成员id.startsWith('组::')) return;
        const n = 数据仓库.节点.get(成员id);
        if (!n) return;
        if (!显示节点.includes(n)) return;
        if (已处理.has(成员id)) return;
        html += 渲染节点条目(n, 面板宽);
        已处理.add(成员id);
      });
    });

    // 未分组的节点
    const 未分组节点 = 显示节点.filter(n => !已处理.has(n.id));
    if (未分组节点.length > 0) {
      if (节点到分组.size > 0) {
        html += `<div class="group-separator" style="padding:6px 12px;font-size:11px;color:var(--text-muted);background:var(--surface-hover);font-weight:600">未分组</div>`;
      }
      未分组节点.forEach(n => {
        html += 渲染节点条目(n, 面板宽);
      });
    }
  }

  console.log('[X4] render htmlLen='+html.length+' panel='+!!面板容器);
  面板容器.innerHTML = html;
  // 动态设置底部留白：让最后一个条目也能滚到列表顶部
  // padding = 容器高度 - 60（最小条目高度），确保最后一个条目滚到顶部时下方有空白但不完全无节点
  const 容器高度 = 面板容器.clientHeight;
  面板容器.style.paddingBottom = Math.max(0, 容器高度 - 60) + 'px';
}

/** 渲染单个节点条目（辅助函数） */
function 渲染节点条目(节点数据, 面板宽) {
  const id = 节点数据.id;
  const 成员函数列表 = 数据仓库.节点成员函数.get(id) || [];
  const 成员变量列表 = 数据仓库.节点成员变量.get(id) || [];
  const 约束列表 = 数据仓库.节点约束.get(id) || [];
  const 测试列表 = (数据仓库.节点.get(id) || {})._测试项 || [];
  const 责任 = 数据仓库.责任映射.get(id);
  const 置信度级别 = 节点数据.置信度 === '高' ? 'high' : 节点数据.置信度 === '低' ? 'low' : 'med';

  const 宽屏 = 面板宽 >= 500;

  let html = `<div class="type-accordion" data-node-id="${id}">`;
  html += `<div class="type-accordion-header" onclick="切换折叠('${id}')">`;
  html += `<span class="type-accordion-name">▶ <span>${节点数据.名称 || id}</span> <span class="confidence-badge ${置信度级别}">${节点数据.置信度 || '中'}</span>`;
  // 跨项目标注：节点属于其他项目时显示项目标签（帮助在"全部项目"模式下区分）
  const 所属项目 = 数据仓库.节点.get(id)?.所属项目;
  if (所属项目 && 所属项目 !== 当前项目名称) {
    html += ` <span class="project-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;background:#e8f4ff;color:#1d6fb8;border:1px solid #1d6fb8">📁 ${所属项目}</span>`;
  }
  if (节点数据.类型 === 'enum') {
    html += ` <span class="enum-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">enum</span>`;
  } else if (节点数据.类型 === 'interface' && !节点数据.是约定类型) {
    html += ` <span class="interface-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">interface</span>`;
  } else if (节点数据.是约定类型) {
    html += ` <span class="convention-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">约定</span>`;
  } else if (节点数据.类型 === 'func') {
    html += ` <span class="func-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">func</span>`;
  } else if (节点数据.类型 === 'variable') {
    const 类型名 = 节点数据.类型名 || '';
    html += ` <span class="variable-tag" style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;background:#f3e8f9;color:#7d3c98;border:1px solid #9b59b6">变量${类型名 ? ' · ' + 类型名 : ''}</span>`;
  }
  html += `</span>`;
  html += `<span style="font-size:13px;color:var(--text-secondary);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${责任 ? 责任.职责描述 : '—'}</span>`;
  if (宽屏) {
    html += `<span style="font-size:11px;color:var(--text-muted);text-align:right">${测试列表.length ? '🧪'+测试列表.length : ''} ${约束列表.length ? '🔗'+约束列表.length : ''} ${成员函数列表.length ? '🔧'+成员函数列表.length : ''} ${成员变量列表.length ? '📦'+成员变量列表.length : ''}</span>`;
  }
  html += `</div>`;
  html += `<div class="type-accordion-body">`;

  if (责任) {
    html += '<div class="type-detail-section" style="margin-bottom:4px">';
    // 职责描述支持富文本和节点链接（任务 #19）
    html += '<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-word">' + 解析富文本(责任.职责描述) + '</p>';
    html += '</div>';
  }

  if ((节点数据.类型 === 'func' || 节点数据.类型 === 'memberfunc') && 节点数据.签名) {
    html += '<div class="type-detail-section" style="margin-bottom:4px">';
    html += '<span style="font-size:11px;color:var(--text-muted)">📝 签名：</span>';
    html += '<code style="font-size:11px;background:var(--surface-hover);padding:2px 6px;border-radius:3px">' + 节点数据.签名 + '</code>';
    html += '</div>';
  }

  if (节点数据.类型 === 'enum' && 节点数据.枚举值 && 节点数据.枚举值.length) {
    html += '<div class="type-detail-section"><h5>📋 枚举值</h5>';
    html += '<table class="type-detail-table">';
    节点数据.枚举值.forEach(v => {
      html += `<tr><td style="font-size:12px;padding:2px 6px">• ${v}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (责任 && 责任.对应需求条目.length) {
    html += `<span style="font-size:10px;color:var(--text-muted)">需求：${责任.对应需求条目.map(r => `<span class="req-tag">${r}</span>`).join(' ')}</span>`;
  }

  const 是否可拥有成员 = 节点数据.类型 === 'class' || 节点数据.类型 === 'struct' || 节点数据.类型 === 'interface';
  if (是否可拥有成员) {
    html += `<div class="type-detail-section" style="margin-top:6px"><h5>🔧 成员函数 (${成员函数列表.length})</h5>`;
    if (成员函数列表.length > 0) {
      html += `<table class="type-detail-table"><tr><th>函数名</th><th>职责</th></tr>`;
      成员函数列表.forEach(f => {
        html += `<tr data-func-name="${f.函数名}" onclick="点击成员函数行('${id}','${f.函数名}')" style="cursor:pointer" title="点击高亮画布中的成员函数节点"><td><strong>${f.函数名}</strong>${f.有签名 ? `(${f.签名提示})` : '(…)'}</td><td>${解析富文本(f.职责)}</td></tr>`;
        // memberfunc 节点不在右侧面板独立显示，其约束通过父类型的成员函数表展示
        // id 格式 = 父id.函数名（见 _添加成员函数 中的 mfNodeId 生成）
        const mfId = `${id}.${f.函数名}`;
        const mf约束 = 数据仓库.节点约束.get(mfId) || [];
        if (mf约束.length > 0) {
          html += `<tr class="member-convention-row"><td colspan="2" style="padding:2px 6px 4px 12px;background:var(--surface-hover)">`;
          html += `<div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">🔗 约束 (${mf约束.length})</div>`;
          mf约束.forEach(y => {
            html += `<div style="font-size:11px;padding:1px 0">• ${y.条件} → ${y.触发效果} <span class="detail-source-tag step${y.来源步骤}">步${y.来源步骤}</span></div>`;
          });
          html += `</td></tr>`;
        }
      });
      html += `</table>`;
    } else {
      html += `<div class="detail-empty">暂无 — 待第二步补充</div>`;
    }
    html += `</div>`;

    // 成员变量表：与成员函数对称，membervar 节点同样不在右侧列表独立显示
    html += `<div class="type-detail-section" style="margin-top:6px"><h5>📦 成员变量 (${成员变量列表.length})</h5>`;
    if (成员变量列表.length > 0) {
      html += `<table class="type-detail-table"><tr><th>变量名</th><th>类型</th><th>职责</th></tr>`;
      成员变量列表.forEach(v => {
        html += `<tr data-var-name="${v.变量名}" onclick="点击成员变量行('${id}','${v.变量名}')" style="cursor:pointer" title="点击高亮画布中的成员变量节点"><td><strong>${v.变量名}</strong></td><td>${v.类型 || '—'}</td><td>${解析富文本(v.职责)}</td></tr>`;
        // membervar 节点的约束通过父类型的成员变量表展示（与 memberfunc 一致）
        const mvId = `${id}.${v.变量名}`;
        const mv约束 = 数据仓库.节点约束.get(mvId) || [];
        if (mv约束.length > 0) {
          html += `<tr class="member-convention-row"><td colspan="3" style="padding:2px 6px 4px 12px;background:var(--surface-hover)">`;
          html += `<div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">🔗 约束 (${mv约束.length})</div>`;
          mv约束.forEach(y => {
            html += `<div style="font-size:11px;padding:1px 0">• ${y.条件} → ${y.触发效果} <span class="detail-source-tag step${y.来源步骤}">步${y.来源步骤}</span></div>`;
          });
          html += `</td></tr>`;
        }
      });
      html += `</table>`;
    } else {
      html += `<div class="detail-empty">暂无</div>`;
    }
    html += `</div>`;
  }

  // 测试项板块
  html += `<div class="type-detail-section"><h5>🧪 测试项 (${测试列表.length})</h5>`;
  if (测试列表.length > 0) {
    html += `<table class="type-detail-table"><tr><th>测试标题</th></tr>`;
    测试列表.forEach(t => {
      html += `<tr><td>• ${t.标题}</td></tr>`;
    });
    html += `</table>`;
  } else {
    html += `<div class="detail-empty">暂无测试</div>`;
  }
  html += `</div>`;

  // 约束板块：始终显示，不再受宽屏和长度限制
  html += `<div class="type-detail-section"><h5>🔗 约束 (${约束列表.length})</h5>`;
  if (约束列表.length > 0) {
    html += `<table class="type-detail-table"><tr><th>条件</th><th>效果</th></tr>`;
    约束列表.forEach(y => {
      html += `<tr><td>${y.条件}</td><td>${y.触发效果} <span class="detail-source-tag step${y.来源步骤}">步${y.来源步骤}</span></td></tr>`;
    });
    html += `</table>`;
  } else {
    html += `<div class="detail-empty">暂无约束</div>`;
  }
  html += `</div>`;

  html += `</div></div>`;
  return html;
}

/**
 * 滚动条目到列表容器顶部（只滚动 #type-panel-list 本身）
 * 不使用 scrollIntoView，避免它滚动所有祖先容器导致整体 UI 偏移
 */
function 滚动条目到列表顶部(条目) {
  if (!条目) return;
  const rect = 条目.getBoundingClientRect();
  const containerRect = 面板容器.getBoundingClientRect();
  // 条目相对于容器顶部的偏移（包含当前滚动量）
  const offset = rect.top - containerRect.top + 面板容器.scrollTop;
  // 滚动到顶部（留 4px 间距）
  面板容器.scrollTo({ top: Math.max(0, offset - 4), behavior: 'smooth' });
}

/** 切换某个类型的折叠/展开 */
function 切换折叠(id) {
  const item = 面板容器.querySelector(`.type-accordion[data-node-id="${id}"]`);
  if (!item) return;
  item.classList.toggle('open');

  const 是展开 = item.classList.contains('open');
  当前高亮节点 = 是展开 ? id : null;
  刷新视图();

  // ========== 画布选中同步（单选模式） ==========
  if (是展开 && 数据仓库.节点.has(id)) {
    // 展开 → 画布中对应节点选中（自动先清空之前选中，保证单选）
    设置画布节点选中(id);
    // 若节点属于已激活的分组，画布上节点被折叠进组节点，应聚焦组节点
    let 目标节点id = id;
    for (const [组名, 成员] of 数据仓库.分组) {
      if (激活的分组.has(组名) && 成员.has(id)) {
        目标节点id = `组::${组名}`;
        break;
      }
    }
    try { 图.focusElement(目标节点id); } catch(e) { /* 节点可能被过滤器隐藏，忽略 */ }
  } else if (!是展开) {
    // 收起 → 如果该节点正好是当前画布选中的，则清空选中状态
    if (当前选中节点id === id) {
      清空选中状态();
    }
  }
  // 记录浏览历史（任务 #20）
  记录浏览历史(捕获当前状态());
}

/** 切换某个分组的折叠/展开 */
function 切换组折叠(组名) {
  const item = 面板容器.querySelector(`.group-accordion[data-group-name="${组名}"]`);
  if (!item) return;
  item.classList.toggle('open');

  const 是展开 = item.classList.contains('open');
  if (是展开) {
    // 激活分组使画布显示组节点（如尚未激活）
    if (!激活的分组.has(组名)) {
      激活的分组.add(组名);
      刷新视图();
    }
    // 选中画布中的组节点并聚焦
    const 组节点id = `组::${组名}`;
    当前高亮节点 = 组节点id;
    刷新视图();
    try { 图.focusElement(组节点id); } catch(e) { /* 组节点可能不存在，忽略 */ }
  } else {
    当前高亮节点 = null;
    刷新视图();
  }
  // 记录浏览历史（任务 #20）
  记录浏览历史(捕获当前状态());
}

/**
 * 点击成员函数行：在画布上展开对应类型的成员函数（任务 #14 + 任务 #27）
 * - 任务 #14：高亮画布中的成员函数节点
 * - 任务 #27：不再开启全局"成员函数"过滤器（那会让所有类型的成员函数都显示）
 *   而是为父类型节点的成员函数子节点设置 强制显示集合
 *   这样画布上只展开该类型的成员函数，其他类型的成员函数仍按全局过滤
 *   相当于为该父类型节点设置了一个"成员函数=true"的节点过滤器
 */
function 点击成员函数行(父id, 函数名) {
  const mfId = `${父id}.${函数名}`;
  // 任务 #27：把父类型的所有成员函数子节点加入 强制显示集合
  // 这样即使全局隐藏"成员函数"，该类型的成员函数仍会在画布上显示
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) { for (const 边 of 边数组) 所有边.push(边); }
  let 强制数 = 0;
  所有边.forEach(edge => {
    if (edge.source === 父id) {
      const 目标分类 = 节点分类.get(edge.target);
      if (目标分类 === '成员函数') {
        if (!强制显示集合.has(edge.target)) {
          强制显示集合.add(edge.target);
          强制数++;
        }
        // 同步从 隐藏节点集合 移除（避免被隐藏集合覆盖，隐藏集合优先级最高）
        if (隐藏节点集合.has(edge.target)) {
          隐藏节点集合.delete(edge.target);
        }
      }
    }
  });
  // 保存节点过滤器状态：成员函数=true，其他保持全局（用于弹窗回显）
  const 当前状态 = 获取节点过滤初始状态(父id);
  当前状态['成员函数'] = true;
  当前状态.范围 = '当前';
  节点过滤器状态.set(父id, 当前状态);

  当前高亮节点 = mfId;
  刷新视图();
  // 延迟聚焦，等待画布刷新后再定位
  setTimeout(() => {
    try { 图.focusElement(mfId); } catch(e) { /* 节点可能仍被隐藏，忽略 */ }
  }, 120);
  显示提示(`展开「${父id}」的成员函数「${函数名}」${强制数 > 0 ? '（强制显示 ' + 强制数 + ' 个）' : ''}`, 1500);
  // 记录浏览历史
  记录浏览历史(捕获当前状态());
}

/**
 * 点击成员变量行：高亮画布中对应的 membervar 节点
 * 与 点击成员函数行 对称——把父类型的所有成员变量子节点加入强制显示集合
 * 这样即使全局隐藏"成员变量"，该类型的成员变量仍会在画布上显示
 */
function 点击成员变量行(父id, 变量名) {
  const mvId = `${父id}.${变量名}`;
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) { for (const 边 of 边数组) 所有边.push(边); }
  let 强制数 = 0;
  所有边.forEach(edge => {
    if (edge.source === 父id) {
      const 目标分类 = 节点分类.get(edge.target);
      if (目标分类 === '成员变量') {
        if (!强制显示集合.has(edge.target)) {
          强制显示集合.add(edge.target);
          强制数++;
        }
        if (隐藏节点集合.has(edge.target)) {
          隐藏节点集合.delete(edge.target);
        }
      }
    }
  });
  // 保存节点过滤器状态：成员变量=true，其他保持全局（用于弹窗回显）
  const 当前状态 = 获取节点过滤初始状态(父id);
  当前状态['成员变量'] = true;
  当前状态.范围 = '当前';
  节点过滤器状态.set(父id, 当前状态);

  当前高亮节点 = mvId;
  刷新视图();
  setTimeout(() => {
    try { 图.focusElement(mvId); } catch(e) { /* 节点可能仍被隐藏，忽略 */ }
  }, 120);
  显示提示(`展开「${父id}」的成员变量「${变量名}」${强制数 > 0 ? '（强制显示 ' + 强制数 + ' 个）' : ''}`, 1500);
  记录浏览历史(捕获当前状态());
}

/**
 * 解析职责描述中的富文本和节点链接（任务 #19）
 * 支持语法：
 *   [显示名](节点id)   — 可点击的节点链接，点击后跳转展开
 *   **加粗**           — <strong>
 *   *斜体*             — <em>
 *   `代码`             — <code>
 *   普通换行            — <br>
 */
function 解析富文本(文本) {
  if (!文本) return '';
  // 先转义 HTML 特殊字符，防止注入
  let s = 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 节点链接 [显示名](节点id) — 必须放在其他解析之前，避免被转义影响
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, 名称, id) => {
    // 转义引号防止破坏 onclick
    const 安全名称 = 名称.replace(/'/g, '&#39;');
    const 安全id = id.replace(/'/g, '&#39;');
    return `<a href="#" onclick="跳转节点('${安全id}'); return false;" style="color:var(--accent);text-decoration:underline;cursor:pointer" title="跳转到节点 ${安全id}">${安全名称}</a>`;
  });
  // 加粗 **文本**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *文本*（避免与加粗冲突，匹配单个*且内部无*）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // 行内代码 `文本`
  s = s.replace(/`([^`]+)`/g, '<code style="background:var(--surface-hover);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
  // 换行
  s = s.replace(/\n/g, '<br>');
  return s;
}

/** 从职责描述链接跳转到指定节点（任务 #19） */
function 跳转节点(id) {
  const 实际id = 数据仓库.节点.has(id)
    ? id
    : Array.from(数据仓库.节点.keys()).find(k => k === id || 数据仓库.节点.get(k)?.名称 === id);
  if (!实际id) {
    显示提示(`节点「${id}」不存在`, 1500);
    return;
  }
  // 展开右侧面板对应条目
  let item = 面板容器.querySelector(`.type-accordion[data-node-id="${实际id}"]`);
  if (!item) {
    // 节点不在当前过滤视图中：切换到"所有"后再查找
    面板过滤 = '所有';
    面板过滤按钮们.forEach(b => b.classList.toggle('on', b.dataset.panelFilter === '所有'));
    刷新类型面板();
    item = 面板容器.querySelector(`.type-accordion[data-node-id="${实际id}"]`);
  }
  if (item) {
    if (!item.classList.contains('open')) item.classList.add('open');
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    item.querySelector('.type-accordion-header')?.classList.add('highlighted');
    setTimeout(() => item.querySelector('.type-accordion-header')?.classList.remove('highlighted'), 2000);
    当前高亮节点 = 实际id;
    刷新视图();
    // 画布聚焦（若属于已激活分组则聚焦组节点）
    let 目标节点id = 实际id;
    for (const [组名, 成员] of 数据仓库.分组) {
      if (激活的分组.has(组名) && 成员.has(实际id)) {
        目标节点id = `组::${组名}`;
        break;
      }
    }
    try { 图.focusElement(目标节点id); } catch(e) { /* 忽略 */ }
  }
  记录浏览历史(捕获当前状态());
  显示提示(`跳转到「${实际id}」`, 1000);
}

/**
 * 跳转组成员：在"分组"过滤模式下点击组成员行时调用（任务 #26）
 * - 普通节点：委托给 跳转节点()，会自动切换到"所有"过滤并展开目标节点
 * - 组引用（组::组名）：在当前面板中找到对应组条目，展开并滚动到该位置
 * 两种情况都会记录浏览历史
 */
function 跳转组成员(id) {
  if (id.startsWith('组::')) {
    const 组名 = id.substring(3);
    let item = 面板容器.querySelector(`.group-accordion[data-group-name="${组名}"]`);
    if (!item) {
      // 当前过滤视图下找不到组条目：切换到"分组"过滤
      面板过滤 = '分组';
      面板过滤按钮们.forEach(b => b.classList.toggle('on', b.dataset.panelFilter === '分组'));
      刷新类型面板();
      item = 面板容器.querySelector(`.group-accordion[data-group-name="${组名}"]`);
    }
    if (item) {
      if (!item.classList.contains('open')) item.classList.add('open');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      item.querySelector('.type-accordion-header')?.classList.add('highlighted');
      setTimeout(() => item.querySelector('.type-accordion-header')?.classList.remove('highlighted'), 2000);
    }
    记录浏览历史(捕获当前状态());
    显示提示(`跳转到组「${组名}」`, 1000);
  } else {
    跳转节点(id);
  }
}

// ========== 内联浮层 ==========
const 内联浮层 = document.getElementById('inline-popover');
const 浮层内容 = document.getElementById('popover-content');
let 内联展开节点 = null;

function 显示内联浮层(节点id, clientX, clientY) {
  const 节点数据 = 数据仓库.节点.get(节点id);
  if (!节点数据) return;
  const 成员函数列表 = 数据仓库.节点成员函数.get(节点id) || [];
  const 成员变量列表 = 数据仓库.节点成员变量.get(节点id) || [];
  const 约束列表 = 数据仓库.节点约束.get(节点id) || [];
  const 测试列表 = 节点数据._测试项 || [];
  const 责任 = 数据仓库.责任映射.get(节点id);
  const 置信度级别 = 节点数据.置信度 === '高' ? 'high' : 节点数据.置信度 === '低' ? 'low' : 'med';
  const 签名 = 节点数据.签名 || '';

  let html = `<strong>${节点数据.名称 || 节点id}</strong> <span class="confidence-badge ${置信度级别}">${节点数据.置信度||'中'}</span>`;
  if (签名) html += ` <span style="font-size:10px;color:var(--text-muted)">${签名}</span>`;
  if (节点数据.类型 === 'enum' && 节点数据.枚举值 && 节点数据.枚举值.length) {
    html += `<div style="margin:6px 0 2px 0;font-size:11px;color:var(--text-secondary);background:var(--surface-hover);border-radius:4px;padding:4px 8px">`;
    节点数据.枚举值.forEach(v => { html += `<div style="padding:1px 0">• ${v}</div>`; });
    html += '</div>';
  }
  if (责任) html += `<p style="margin:4px 0 0 0;font-size:12px">${解析富文本(责任.职责描述)}</p>`;
  if (成员函数列表.length) {
    html += '<table class="type-detail-table" style="margin-top:6px"><tr><th>函数</th><th>职责</th></tr>';
    成员函数列表.forEach(f => html += `<tr><td><strong>${f.函数名}</strong>${f.有签名?'('+f.签名提示+')':'(…)'}</td><td>${解析富文本(f.职责)}</td></tr>`);
    html += '</table>';
  }
  // 成员变量表：与成员函数对称
  if (成员变量列表.length) {
    html += '<table class="type-detail-table" style="margin-top:6px"><tr><th>变量</th><th>类型</th><th>职责</th></tr>';
    成员变量列表.forEach(v => html += `<tr><td><strong>${v.变量名}</strong></td><td>${v.类型 || '—'}</td><td>${解析富文本(v.职责)}</td></tr>`);
    html += '</table>';
  }
  // 测试项板块：与右侧面板保持一致
  if (测试列表.length > 0) {
    html += `<div style="margin-top:4px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">🧪 测试项 (${测试列表.length})</div>`;
    html += '<table class="type-detail-table"><tr><th>测试标题</th></tr>';
    测试列表.forEach(t => html += `<tr><td>• ${t.标题}</td></tr>`);
    html += '</table></div>';
  }
  // 约束板块：始终显示，与右侧面板的约束板块保持一致（无约束时显示占位符）
  html += `<div style="margin-top:4px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">🔗 约束 (${约束列表.length})</div>`;
  if (约束列表.length > 0) {
    html += '<table class="type-detail-table"><tr><th>条件</th><th>效果</th></tr>';
    约束列表.forEach(y => html += `<tr><td>${y.条件}</td><td>${y.触发效果}<span class="detail-source-tag step${y.来源步骤}">步${y.来源步骤}</span></td></tr>`);
    html += '</table>';
  } else {
    html += `<div class="detail-empty">暂无约束</div>`;
  }
  html += `</div>`;
  浮层内容.innerHTML = html;

  // 浮层定位 — 智能避让视口边界
  const 浮层宽 = 420;
  const 浮层最大高 = 400;
  let left = clientX;
  let top = clientY - 20;

  // 右边界：翻到节点左侧
  if (left + 浮层宽 > window.innerWidth - 20) {
    left = clientX - 浮层宽 - 20;
  }
  // 左边界
  if (left < 10) left = 10;
  // 下边界
  if (top + 浮层最大高 > window.innerHeight - 20) {
    top = window.innerHeight - 浮层最大高 - 20;
  }
  // 上边界
  if (top < 10) top = 10;

  内联浮层.style.left = left + 'px';
  内联浮层.style.top = top + 'px';
  内联浮层.classList.add('visible');
  内联展开节点 = 节点id;
  当前高亮节点 = 节点id;
  刷新视图();
}

function 关闭内联浮层() {
  内联浮层.classList.remove('visible');
  内联展开节点 = null;
  当前高亮节点 = null;
  刷新视图();
}

document.addEventListener('click', (e) => {
  if (内联展开节点 && !内联浮层.contains(e.target) && e.target !== 内联浮层) {
    关闭内联浮层();
  }
});

// ========== 选中状态管理 ==========
// 画布中当前选中的节点 id（单选，null 表示无选中）
// 选中后：节点边框加粗+高亮，关联的所有边也加粗+高亮
let 当前选中节点id = null;
// 当前处于"高亮"状态的边 id 集合（用于批量清除）
let 当前高亮边id集合 = new Set();

/**
 * 根据节点 id 找出所有关联的边 id（source 或 target 为该节点）
 * NOTE: 边对象本身没有 id 属性，G6 会自动生成边 ID。
 *   这里通过 图.getEdgeData() 获取 G6 中实际的边数据（含自动生成的 id），
 *   再按 source/target 匹配出关联边的真实 ID。
 * @param {string} 节点id
 * @returns {string[]} 关联边的 id 数组
 */
function 查找关联边id数组(节点id) {
  const 结果 = [];
  try {
    // 从 G6 获取当前画布上所有边数据（含 G6 自动生成的 id）
    const 所有边数据 = 图.getEdgeData() || [];
    for (const 边 of 所有边数据) {
      if (边 && (边.source === 节点id || 边.target === 节点id)) {
        if (边.id) 结果.push(边.id);
      }
    }
  } catch (e) {}
  // 兜底：如果 G6 API 失败，从数据仓库按 key 格式构造 ID
  // G6 v5 默认边 ID 格式为 `${source}-${target}`，但同一对节点可能有多条边
  if (结果.length === 0) {
    try {
      const { 可见边 } = 计算可见元素();
      for (const 边 of 可见边) {
        if (边 && (边.source === 节点id || 边.target === 节点id)) {
          // 尝试多种可能的 ID 格式
          const 可能id = [
            边.id,
            `${边.source}-${边.target}`,
            `${边.source}->${边.target}`,
          ].filter(Boolean);
          for (const id of 可能id) {
            if (id && !结果.includes(id)) 结果.push(id);
          }
        }
      }
    } catch (e) {}
  }
  return 结果;
}

/**
 * 清空画布上的选中状态（节点"选中" + 边"高亮"）
 * 保持视图不变，只清状态，不触发过滤或刷新面板
 */
function 清空选中状态() {
  try {
    if (当前选中节点id) {
      // 重建 type states 而非清空 []，避免 G6 丢失类型样式或触发布局重算
      const 原始 = 数据仓库.节点.get(当前选中节点id);
      if (原始) {
        const 基础states = [原始.类型 || 'class', '置信度' + (原始.置信度 || '中')];
        if (原始.已附加约定?.length) 基础states.push('已附加约定');
        try { 图.setElementState(当前选中节点id, 基础states); } catch (e) {}
      } else {
        try { 图.setElementState(当前选中节点id, []); } catch (e) {}
      }
    }
    // 边的状态清除：重建边类型 state 而非清空 []
    for (const 边id of 当前高亮边id集合) {
      try {
        // 从边数据中恢复关系类型 state
        const 边数据 = 图.getEdgeData(边id);
        if (边数据 && 边数据.关系类型) {
          图.setElementState(边id, [边数据.关系类型]);
        } else {
          图.setElementState(边id, []);
        }
      } catch (e) {}
    }
  } catch (e) {}
  当前选中节点id = null;
  当前高亮边id集合.clear();
}

/**
 * 设置画布中某个节点为选中状态（单选模式）
 * 会先清空之前的选中，再给当前节点设置"选中"状态，关联边设置"高亮"状态
 * @param {string|null} 节点id 传 null 表示只清空不选中
 */
function 设置画布节点选中(节点id) {
  清空选中状态();
  if (!节点id) return;
  当前选中节点id = 节点id;
  // 重建完整 states：type + 置信度 + 已附加约定 + 选中
  // 避免只设 ['选中'] 导致 G6 丢失类型样式或触发布局重算
  const 原始 = 数据仓库.节点.get(节点id);
  if (原始) {
    const states = [原始.类型 || 'class', '置信度' + (原始.置信度 || '中')];
    if (原始.已附加约定?.length) states.push('已附加约定');
    states.push('选中');
    try { 图.setElementState(节点id, states); } catch (e) {}
  } else {
    try { 图.setElementState(节点id, ['选中']); } catch (e) {}
  }
  // 设置关联边高亮（保留边类型 state + 追加"高亮"）
  const 关联边id = 查找关联边id数组(节点id);
  for (const 边id of 关联边id) {
    try {
      const 边数据 = 图.getEdgeData(边id);
      const 边states = [];
      if (边数据 && 边数据.关系类型) 边states.push(边数据.关系类型);
      边states.push('高亮');
      图.setElementState(边id, 边states);
    } catch (e) {}
    当前高亮边id集合.add(边id);
  }
}

// 画布空白处点击 → 取消选中
图.on('canvas:click', () => {
  清空选中状态();
});

// ========== 节点点击 ==========
图.on('node:click', (evt) => {
  const 节点id = evt.target?.id || evt.target?.getAttribute?.('data-node-id');
  if (!节点id) return;

  const 实际id = 数据仓库.节点.has(节点id) ? 节点id :
    Array.from(数据仓库.节点.keys()).find(k => k === 节点id || 数据仓库.节点.get(k)?.名称 === 节点id);
  if (!实际id) return;

  // ============== 选中状态切换（无论内联/非内联模式都先处理） ==============
  if (当前选中节点id === 实际id) {
    // 再次点击同一节点 → 取消选中，恢复初始状态
    清空选中状态();
  } else {
    // 点击不同节点 → 单选切换
    设置画布节点选中(实际id);
  }

  if (内联模式) {
    if (内联展开节点 === 实际id) {
      关闭内联浮层();
      显示提示(`已关闭「${实际id}」`, 800);
    } else {
      关闭内联浮层();
      const rect = evt.target?.getBoundingClientRect?.() || { left: evt.clientX, top: evt.clientY };
      显示内联浮层(实际id, rect.right + 8, rect.top);
      显示提示(`内联展开「${实际id}」`, 800);
    }
  } else {
    关闭内联浮层();
    const 分类 = 节点分类.get(实际id);

    // 成员函数/成员变量节点：展开父类型条目并跳转到对应行
    // 这两类不在右侧列表中作为独立条目，需定位到其父类型的成员表
    if (分类 === '成员函数' || 分类 === '成员变量') {
      // 优先从边数据查找父类型 id（最可靠）
      let 父类型id = null;
      for (const [key, 边] of 数据仓库.边) {
        if (边.target === 实际id && 边.关系类型 === '拥有') {
          父类型id = 边.source;
          break;
        }
      }
      // 回退：从 id 格式 `${父id}.${名称}` 解析
      if (!父类型id) {
        const idx = 实际id.lastIndexOf('.');
        if (idx > 0) 父类型id = 实际id.substring(0, idx);
      }
      if (!父类型id) {
        显示提示(`无法定位「${实际id}」的父类型`, 1500);
        window._最后点击节点id = 实际id;
        return;
      }

      let 父条目 = 面板容器.querySelector(`.type-accordion[data-node-id="${父类型id}"]`);
      // 父类型不在当前过滤视图中：切换到"所有"后再查找
      if (!父条目) {
        面板过滤 = '所有';
        面板过滤按钮们.forEach(b => b.classList.toggle('on', b.dataset.panelFilter === '所有'));
        刷新类型面板();
        父条目 = 面板容器.querySelector(`.type-accordion[data-node-id="${父类型id}"]`);
      }
      if (!父条目) {
        显示提示(`父类型「${父类型id}」不在节点列表中`, 1500);
        window._最后点击节点id = 实际id;
        return;
      }

      // 处理"已打开"情况：只展开不折叠
      const 已展开 = 父条目.classList.contains('open');
      if (!已展开) 父条目.classList.add('open');
      滚动条目到列表顶部(父条目);
      父条目.querySelector('.type-accordion-header').classList.add('highlighted');
      setTimeout(() => 父条目.querySelector('.type-accordion-header')?.classList.remove('highlighted'), 2000);
      当前高亮节点 = 父类型id;
      刷新视图();

      // 展开动画后定位到对应表行（成员函数表 or 成员变量表）
      const 子名 = (数据仓库.节点.get(实际id) || {}).名称 || 实际id.split('.').pop();
      const 是函数 = 分类 === '成员函数';
      setTimeout(() => {
        const 行选择器 = 是函数 ? `tr[data-func-name="${子名}"]` : `tr[data-var-name="${子名}"]`;
        const 行 = 父条目.querySelector(行选择器);
        if (行) {
          行.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          行.classList.add('highlighted');
          setTimeout(() => 行.classList.remove('highlighted'), 2000);
        }
      }, 320);
      显示提示(`跳转到「${父类型id}」的${是函数 ? '成员函数' : '成员变量'}「${子名}」`, 1500);
      window._最后点击节点id = 实际id;
      return;
    }

    // 普通节点：在右侧列表中展开/折叠对应条目
    let item = 面板容器.querySelector(`.type-accordion[data-node-id="${实际id}"]`);
    // 节点不在当前过滤视图中：切换到"所有"后再查找
    if (!item) {
      面板过滤 = '所有';
      面板过滤按钮们.forEach(b => b.classList.toggle('on', b.dataset.panelFilter === '所有'));
      刷新类型面板();
      item = 面板容器.querySelector(`.type-accordion[data-node-id="${实际id}"]`);
    }
    if (item) {
      const wasOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!wasOpen) 滚动条目到列表顶部(item);
      item.querySelector('.type-accordion-header').classList.add('highlighted');
      setTimeout(() => item.querySelector('.type-accordion-header').classList.remove('highlighted'), 2000);
      当前高亮节点 = item.classList.contains('open') ? 实际id : null;
      刷新视图();
    }
    显示提示(`${item?.classList.contains('open') ? '展开' : '折叠'}「${实际id}」`, 1000);
  }
  window._最后点击节点id = 实际id;
});

// ========== 右键菜单 + 聚焦模式 ==========
const 右键菜单 = document.getElementById('context-menu');
const 聚焦条 = document.getElementById('focus-bar');
let 右键目标节点 = null;

图.on('node:contextmenu', (evt) => {
  evt.preventDefault();
  const originalEvent = evt.originalEvent || evt.nativeEvent || window.event;
  右键目标节点 = evt.target?.id;
  if (!右键目标节点) return;
  // 组节点（id 以 组:: 开头）直接使用，普通节点需要查找实际 id
  if (右键目标节点.startsWith('组::')) {
    // 组节点，直接使用
  } else {
    const 实际id = 数据仓库.节点.has(右键目标节点) ? 右键目标节点 :
      Array.from(数据仓库.节点.keys()).find(k => k === 右键目标节点 || 数据仓库.节点.get(k)?.名称 === 右键目标节点);
    if (!实际id) return;
    右键目标节点 = 实际id;
  }
  // 边缘只读节点：外部项目接口，仅可见、不可操作，禁止弹出右键菜单
  if (边缘只读节点集合.has(右键目标节点)) {
    显示提示('该节点为外部项目接口，仅可见，不可对其进行操作', 2000);
    return;
  }
  右键菜单.style.display = 'block';
  const cx = originalEvent ? originalEvent.clientX : evt.clientX;
  const cy = originalEvent ? originalEvent.clientY : evt.clientY;
  const container = document.getElementById('canvas-container');
  const cr = container.getBoundingClientRect();
  右键菜单.style.left = (cx - cr.left) + 'px';
  右键菜单.style.top = (cy - cr.top) + 'px';
});

document.addEventListener('click', () => { 右键菜单.style.display = 'none'; });

// 只看直接子节点
document.getElementById('ctx-focus').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  // 任务 #28：仅从非聚焦模式进入时保存快照，避免聚焦中切换节点覆盖原始快照
  if (!聚焦节点) {
    保存聚焦前快照();
  }
  聚焦节点 = 右键目标节点;
  聚焦深度 = 1;
  聚焦条.classList.add('show');
  右键菜单.style.display = 'none';
  刷新视图();
  // 组节点聚焦提示特殊处理
  if (聚焦节点.startsWith('组::')) {
    const 组名 = 聚焦节点.substring(3);
    const 组成员数 = 数据仓库.分组.get(组名)?.size || 0;
    显示提示('聚焦分组: ' + 组名 + ' (' + 组成员数 + ' 个成员)', 1500);
  } else {
    显示提示('聚焦: ' + (数据仓库.节点.get(聚焦节点)?.名称 || 聚焦节点), 1500);
  }
});

// 展示所有子节点（递归展开，带环检测，支持组节点 — 任务 #15）
document.getElementById('ctx-focus-all').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  // 任务 #28：仅从非聚焦模式进入时保存快照
  if (!聚焦节点) {
    保存聚焦前快照();
  }
  聚焦节点 = 右键目标节点;
  聚焦深度 = -1;
  聚焦条.classList.add('show');
  右键菜单.style.display = 'none';
  刷新视图();
  // 统计子孙节点数（组节点从组成员开始遍历）
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) { for (const 边 of 边数组) 所有边.push(边); }
  let 起始集 = [右键目标节点];
  let 起始基数 = 0;
  if (右键目标节点.startsWith('组::')) {
    const 组名 = 右键目标节点.substring(3);
    const 组成员 = 数据仓库.分组.get(组名);
    if (组成员) {
      起始集 = Array.from(组成员);
      起始基数 = 组成员.size;
    }
  }
  const 已访问 = new Set(起始集);
  const 待遍历 = Array.from(起始集);
  while (待遍历.length > 0) {
    const 当前 = 待遍历.shift();
    所有边.forEach(e => {
      if (e.source === 当前 && !已访问.has(e.target)) {
        已访问.add(e.target);
        待遍历.push(e.target);
      }
    });
  }
  const 子孙数 = 已访问.size - 起始基数;
  if (右键目标节点.startsWith('组::')) {
    const 组名 = 右键目标节点.substring(3);
    显示提示('递归展开分组: ' + 组名 + ' (' + 起始基数 + ' 个成员, ' + 子孙数 + ' 个子孙节点)', 1500);
  } else {
    显示提示('递归展开: ' + (数据仓库.节点.get(右键目标节点)?.名称 || 右键目标节点) + ' (' + 子孙数 + ' 个子孙节点)', 1500);
  }
});

// ========== 隐藏节点功能（任务 #24） ==========
// 右键菜单"隐藏此节点/隐藏直接子节点/隐藏所有子节点"
// 隐藏的节点加入 隐藏节点集合，在 计算可见元素() 中过滤掉
// 点击最上方过滤器栏的任意按钮时清空 隐藏节点集合，还原所有节点

document.getElementById('ctx-hide').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  隐藏节点集合.add(右键目标节点);
  右键菜单.style.display = 'none';
  刷新视图();
  const 显示名 = 右键目标节点.startsWith('组::')
    ? '组::' + 右键目标节点.substring(3)
    : (数据仓库.节点.get(右键目标节点)?.名称 || 右键目标节点);
  显示提示('已隐藏节点: ' + 显示名, 1500);
});

document.getElementById('ctx-hide-children').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) {
    for (const 边 of 边数组) 所有边.push(边);
  }
  let 隐藏数 = 0;
  if (右键目标节点.startsWith('组::')) {
    // 组节点：隐藏所有组成员
    const 组名 = 右键目标节点.substring(3);
    const 组成员 = 数据仓库.分组.get(组名);
    if (组成员) {
      组成员.forEach(id => { 隐藏节点集合.add(id); 隐藏数++; });
    }
  } else {
    // 普通节点：隐藏所有直接子节点（e.source === 右键目标节点）
    所有边.forEach(edge => {
      if (edge.source === 右键目标节点) {
        隐藏节点集合.add(edge.target);
        隐藏数++;
      }
    });
  }
  右键菜单.style.display = 'none';
  刷新视图();
  显示提示('已隐藏 ' + 隐藏数 + ' 个直接子节点', 1500);
});

document.getElementById('ctx-hide-all-children').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) {
    for (const 边 of 边数组) 所有边.push(边);
  }
  // 起始集：组节点从组成员开始，普通节点从自身开始
  let 起始集 = [右键目标节点];
  if (右键目标节点.startsWith('组::')) {
    const 组名 = 右键目标节点.substring(3);
    const 组成员 = 数据仓库.分组.get(组名);
    if (组成员) 起始集 = Array.from(组成员);
  }
  // BFS 递归收集所有子孙节点（带环检测）
  const 已访问 = new Set(起始集);
  const 待遍历 = Array.from(起始集);
  while (待遍历.length > 0) {
    const 当前 = 待遍历.shift();
    所有边.forEach(edge => {
      if (edge.source === 当前 && !已访问.has(edge.target)) {
        已访问.add(edge.target);
        待遍历.push(edge.target);
      }
    });
  }
  // 隐藏所有子孙节点（不包含右键目标节点本身）
  let 隐藏数 = 0;
  已访问.forEach(id => {
    if (id !== 右键目标节点) {
      隐藏节点集合.add(id);
      隐藏数++;
    }
  });
  右键菜单.style.display = 'none';
  刷新视图();
  显示提示('已隐藏 ' + 隐藏数 + ' 个子孙节点', 1500);
});

// ========== 右键小型过滤器弹窗（任务 #25） ==========
// 右键节点 → "过滤子节点…" → 弹出小型过滤器
// 可选择"当前子节点"（直接子节点）或"所有子节点"（递归子孙）作为过滤范围
// 勾选/取消类型按钮后点击"应用过滤"：
//   - 未勾选类型的子节点 → 加入 隐藏节点集合
//   - 已勾选类型但被全局过滤器隐藏的子节点 → 加入 强制显示集合（任务 #27：突破全局）
//   - 弹窗初始状态 = 该节点上次保存的状态 或 全局过滤器状态（任务 #27）

const 子节点过滤弹窗 = document.createElement('div');
子节点过滤弹窗.id = 'child-filter-popup';
子节点过滤弹窗.style.cssText = 'display:none;position:absolute;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:10px 12px;z-index:1000;min-width:220px;font-size:12px;';
document.body.appendChild(子节点过滤弹窗);

// 当前弹窗的过滤范围状态：'当前' = 直接子节点，'所有' = 递归子孙
let 子节点过滤范围 = '当前';
// 当前弹窗的类型过滤状态（每次打开弹窗时由 获取节点过滤初始状态() 初始化）
const 子节点类型过滤 = { 类型: true, 函数: true, '成员函数': true, 变量: true, '成员变量': true, 枚举: true, 约定: true };

/**
 * 获取节点过滤器的初始状态（任务 #27）
 * - 若该节点上次应用过过滤器，使用保存的状态（实现"记住上次设置"）
 * - 否则使用当前全局过滤器状态（实现"默认与全局一致"）
 * 返回：{ 类型, 函数, '成员函数', 变量, '成员变量', 枚举, 约定, 范围 }
 */
function 获取节点过滤初始状态(节点id) {
  if (节点过滤器状态.has(节点id)) {
    const 保存 = 节点过滤器状态.get(节点id);
    return {
      类型: 保存.类型,
      函数: 保存.函数,
      '成员函数': 保存['成员函数'],
      变量: 保存.变量,
      '成员变量': 保存['成员变量'],
      枚举: 保存.枚举,
      约定: 保存.约定,
      范围: 保存.范围 || '当前',
    };
  }
  // 默认与全局过滤器一致：全局过滤器每次设置就相当于设置所有节点的过滤器
  return {
    类型: 过滤器['类型'],
    函数: 过滤器['函数'],
    '成员函数': 过滤器['成员函数'],
    变量: 过滤器['变量'],
    '成员变量': 过滤器['成员变量'],
    枚举: 过滤器['枚举'],
    约定: 过滤器['约定'],
    范围: '当前',
  };
}

function 刷新子节点过滤弹窗() {
  const 节点名 = 右键目标节点.startsWith('组::')
    ? '组::' + 右键目标节点.substring(3)
    : (数据仓库.节点.get(右键目标节点)?.名称 || 右键目标节点);
  let html = '<div style="font-weight:600;margin-bottom:8px;color:var(--text,#333);border-bottom:1px solid var(--border,#ddd);padding-bottom:6px">🔬 过滤「' + 节点名 + '」的子节点</div>';
  // 范围切换
  html += '<div style="margin-bottom:8px">';
  html += '<span style="color:var(--text-muted,#999);font-size:10px;margin-right:4px">范围：</span>';
  html += '<button class="cf-scope-btn' + (子节点过滤范围 === '当前' ? ' on' : '') + '" data-scope="当前" style="padding:2px 8px;border:1px solid var(--border,#ddd);border-radius:10px;background:' + (子节点过滤范围 === '当前' ? 'var(--accent,#4a90d9)' : 'var(--surface,#fff)') + ';color:' + (子节点过滤范围 === '当前' ? '#fff' : 'var(--text-secondary,#666)') + ';cursor:pointer;font-size:11px;margin-right:3px">当前子节点</button>';
  html += '<button class="cf-scope-btn' + (子节点过滤范围 === '所有' ? ' on' : '') + '" data-scope="所有" style="padding:2px 8px;border:1px solid var(--border,#ddd);border-radius:10px;background:' + (子节点过滤范围 === '所有' ? 'var(--accent,#4a90d9)' : 'var(--surface,#fff)') + ';color:' + (子节点过滤范围 === '所有' ? '#fff' : 'var(--text-secondary,#666)') + ';cursor:pointer;font-size:11px">所有子节点</button>';
  html += '</div>';
  // 类型过滤按钮
  html += '<div style="margin-bottom:8px">';
  html += '<span style="color:var(--text-muted,#999);font-size:10px;margin-right:4px">显示：</span>';
  const 类型列表 = [['类型', '类'], ['函数', '函'], ['成员函数', '成员'], ['变量', '变'], ['成员变量', '成变'], ['枚举', '枚'], ['约定', '约定']];
  类型列表.forEach(([key, label]) => {
    const on = 子节点类型过滤[key];
    html += '<button class="cf-type-btn' + (on ? ' on' : '') + '" data-type="' + key + '" style="padding:2px 8px;border:1px solid var(--border,#ddd);border-radius:10px;background:' + (on ? 'var(--accent,#4a90d9)' : 'var(--surface,#fff)') + ';color:' + (on ? '#fff' : 'var(--text-secondary,#666)') + ';cursor:pointer;font-size:11px;margin-right:3px">' + label + '</button>';
  });
  html += '</div>';
  // 操作按钮
  html += '<div style="display:flex;gap:6px;justify-content:flex-end;border-top:1px solid var(--border,#ddd);padding-top:8px">';
  html += '<button id="cf-cancel" style="padding:4px 12px;border:1px solid var(--border,#ddd);border-radius:4px;background:var(--surface,#fff);color:var(--text-secondary,#666);cursor:pointer;font-size:11px">取消</button>';
  html += '<button id="cf-apply" style="padding:4px 12px;border:none;border-radius:4px;background:var(--accent,#4a90d9);color:#fff;cursor:pointer;font-size:11px">应用过滤</button>';
  html += '</div>';
  html += '<div style="margin-top:6px;font-size:10px;color:var(--text-muted,#999)">提示：未勾选的类型将被隐藏，已勾选的将被还原</div>';
  子节点过滤弹窗.innerHTML = html;

  // 范围切换按钮
  子节点过滤弹窗.querySelectorAll('.cf-scope-btn').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      子节点过滤范围 = btn.dataset.scope;
      刷新子节点过滤弹窗();
    });
  });
  // 类型过滤按钮
  子节点过滤弹窗.querySelectorAll('.cf-type-btn').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const t = btn.dataset.type;
      子节点类型过滤[t] = !子节点类型过滤[t];
      刷新子节点过滤弹窗();
    });
  });
  // 取消按钮
  子节点过滤弹窗.querySelector('#cf-cancel')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    子节点过滤弹窗.style.display = 'none';
  });
  // 应用过滤按钮
  子节点过滤弹窗.querySelector('#cf-apply')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    应用子节点过滤();
    子节点过滤弹窗.style.display = 'none';
  });
}

/** 收集子节点并应用过滤 */
function 应用子节点过滤() {
  if (!右键目标节点) return;
  // 数据仓库.边 是 Map<key, 边数组>，需展平为单条边的数组
  const 所有边 = [];
  for (const 边数组 of 数据仓库.边.values()) { for (const 边 of 边数组) 所有边.push(边); }
  // 确定起始集
  let 起始集 = [右键目标节点];
  if (右键目标节点.startsWith('组::')) {
    const 组名 = 右键目标节点.substring(3);
    const 组成员 = 数据仓库.分组.get(组名);
    if (组成员) 起始集 = Array.from(组成员);
  }
  // 收集子节点
  const 子节点集 = new Set();
  if (子节点过滤范围 === '当前') {
    // 直接子节点
    起始集.forEach(起始 => {
      所有边.forEach(edge => {
        if (edge.source === 起始) 子节点集.add(edge.target);
      });
    });
  } else {
    // 递归所有子孙节点（BFS + 环检测）
    const 已访问 = new Set(起始集);
    const 待遍历 = Array.from(起始集);
    while (待遍历.length > 0) {
      const 当前 = 待遍历.shift();
      所有边.forEach(edge => {
        if (edge.source === 当前 && !已访问.has(edge.target)) {
          已访问.add(edge.target);
          子节点集.add(edge.target);
          待遍历.push(edge.target);
        }
      });
    }
  }
  // 任务 #27：双重机制应用过滤
  // - 未勾选类型 → 加入 隐藏节点集合（从画布移除）
  // - 已勾选类型但被全局过滤器隐藏 → 加入 强制显示集合（突破全局）
  // - 已勾选类型且全局已显示 → 从 隐藏节点集合 和 强制显示集合 中移除（还原）
  let 隐藏数 = 0, 还原数 = 0, 强制数 = 0;
  子节点集.forEach(id => {
    const 分类 = 节点分类.get(id);
    let 类型key = 分类;
    if (分类 === '类型') 类型key = '类型';
    else if (分类 === '函数') 类型key = '函数';
    else if (分类 === '成员函数') 类型key = '成员函数';
    else if (分类 === '变量') 类型key = '变量';
    else if (分类 === '成员变量') 类型key = '成员变量';
    else if (分类 === '枚举') 类型key = '枚举';
    else if (分类 === '约定') 类型key = '约定';
    const 应显示 = 子节点类型过滤[类型key];
    const 全局已显示 = 过滤器[类型key];
    if (应显示) {
      // 用户要显示此子节点
      if (隐藏节点集合.has(id)) { 隐藏节点集合.delete(id); 还原数++; }
      // 突破全局：全局隐藏但节点过滤器要显示 → 加入强制显示集合
      if (!全局已显示) {
        if (!强制显示集合.has(id)) { 强制显示集合.add(id); 强制数++; }
      } else {
        // 全局已显示，无需强制
        if (强制显示集合.has(id)) { 强制显示集合.delete(id); }
      }
    } else {
      // 用户要隐藏此子节点
      if (!隐藏节点集合.has(id)) { 隐藏节点集合.add(id); 隐藏数++; }
      // 同时清除可能的强制显示（避免冲突）
      if (强制显示集合.has(id)) { 强制显示集合.delete(id); }
    }
  });
  // 保存本次过滤状态，用于下次打开弹窗时回显
  节点过滤器状态.set(右键目标节点, {
    类型: 子节点类型过滤.类型,
    函数: 子节点类型过滤.函数,
    '成员函数': 子节点类型过滤['成员函数'],
    变量: 子节点类型过滤.变量,
    '成员变量': 子节点类型过滤['成员变量'],
    枚举: 子节点类型过滤.枚举,
    约定: 子节点类型过滤.约定,
    范围: 子节点过滤范围,
  });
  刷新视图();
  const 范围文 = 子节点过滤范围 === '当前' ? '直接子节点' : '所有子孙节点';
  显示提示('已过滤' + 范围文 + '：隐藏 ' + 隐藏数 + ' 个，还原 ' + 还原数 + ' 个，强制显示 ' + 强制数 + ' 个', 1800);
}

// 点击"过滤子节点…"菜单项
document.getElementById('ctx-filter-children').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!右键目标节点) return;
  右键菜单.style.display = 'none';
  // 任务 #27：初始状态 = 该节点上次保存的状态 或 全局过滤器状态
  // 实现"默认与全局一致"和"记住上次设置"
  const 初始 = 获取节点过滤初始状态(右键目标节点);
  子节点过滤范围 = 初始.范围;
  子节点类型过滤.类型 = 初始.类型;
  子节点类型过滤.函数 = 初始.函数;
  子节点类型过滤['成员函数'] = 初始['成员函数'];
  子节点类型过滤.变量 = 初始.变量;
  子节点类型过滤['成员变量'] = 初始['成员变量'];
  子节点类型过滤.枚举 = 初始.枚举;
  子节点类型过滤.约定 = 初始.约定;
  刷新子节点过滤弹窗();
  // 定位弹窗：在右键菜单位置附近显示
  const container = document.getElementById('canvas-container');
  const cr = container.getBoundingClientRect();
  // 使用上次右键点击的坐标（存储在 右键菜单 的 left/top 上）
  let px = parseFloat(右键菜单.style.left) || 0;
  let py = parseFloat(右键菜单.style.top) || 0;
  // 转换为页面坐标
  px += cr.left;
  py += cr.top;
  // 确保不超出视窗
  const 弹窗宽 = 240, 弹窗高 = 200;
  if (px + 弹窗宽 > window.innerWidth) px = window.innerWidth - 弹窗宽 - 8;
  if (py + 弹窗高 > window.innerHeight) py = window.innerHeight - 弹窗高 - 8;
  子节点过滤弹窗.style.left = px + 'px';
  子节点过滤弹窗.style.top = py + 'px';
  子节点过滤弹窗.style.display = 'block';
});

// 点击其他地方关闭子节点过滤弹窗
document.addEventListener('click', (ev) => {
  if (!子节点过滤弹窗.contains(ev.target) && !ev.target.closest('#ctx-filter-children')) {
    子节点过滤弹窗.style.display = 'none';
  }
});

// 任务 #28：两个退出选项
// "保留更改并退出"：保留聚焦模式中应用的过滤更改，不恢复快照
document.getElementById('btn-exit-focus-keep').addEventListener('click', () => {
  聚焦节点 = null;
  聚焦深度 = 1;
  聚焦条.classList.remove('show');
  // 丢弃快照，保留当前的 强制显示集合 / 隐藏节点集合 / 节点过滤器状态
  聚焦前快照 = null;
  刷新视图();
  显示提示('已保留过滤更改并退出聚焦模式', 1200);
});

// "退出"：回退到进入聚焦模式前的过滤器状态
document.getElementById('btn-exit-focus').addEventListener('click', () => {
  聚焦节点 = null;
  聚焦深度 = 1;
  聚焦条.classList.remove('show');
  // 任务 #28：从快照恢复，回退到进入聚焦前的过滤状态
  恢复聚焦前快照();
  刷新视图();
  显示提示('已回退到聚焦前的过滤状态', 1200);
});

图.on('canvas:click', () => {
  关闭内联浮层();
  当前高亮节点 = null;
  刷新视图();
});

// 初始渲染
刷新类型面板();
// 记录初始浏览状态（任务 #20）—— 作为撤回/重做历史的起点
setTimeout(() => {
  记录浏览历史(捕获当前状态());
}, 100);

// ==================== window.实现纲要 API ====================

// 解析节点 ID：自动补全当前项目命名空间前缀
// 1. 精确匹配优先（如 "项目B.认证服务" 直接命中）
// 2. 未命中时尝试当前命名空间补全（如 "订单" → "项目A.订单"）
// 3. 都未命中则原样返回（交由后续校验处理）
function 解析节点ID(id) {
  if (数据仓库.节点.has(id)) return id;
  if (当前项目名称 && 数据仓库.节点.has(当前项目名称 + '.' + id))
    return 当前项目名称 + '.' + id;
  return id;
}

// 检查修改权限：跨项目引用只读，不能对他项目节点添加成员函数/变量/约束/测试/签名
// 节点的 所属项目 字段在 添加节点 时记录，与 当前项目名称 不同则拒绝修改
function 检查修改权限(节点id) {
  const 节点 = 数据仓库.节点.get(节点id);
  if (!节点) return; // 节点不存在由调用方校验
  if (节点.所属项目 !== 当前项目名称) {
    throw new window.实现纲要APIError(
      '❌ 无权修改其他项目的节点「' + 节点id + '」'
      + '（属于「' + (节点.所属项目 || '未命名项目') + '」）'
      + '。跨项目引用只读：可作为变量类型/调用目标/依赖目标/约定类型，'
      + '但不能添加成员函数/变量/约束/测试/签名。请重新查看 API 文档。'
    );
  }
}

window.实现纲要 = {

  // ========== 项目名称与数据加载 ==========

  /**
   * 设置当前项目名称（命名空间）。
   * 设置后，所有 api.添加节点() / api.添加类() 等创建的节点 ID 自动加 "项目名." 前缀。
   * 引用同项目类型可用短名（解析节点ID 自动补全），引用他项目类型用 "项目名.类型名" 全名。
   * @param {string} 名称 — 项目名称，作为命名空间前缀
   */
  设置项目名称(名称) {
    当前项目名称 = 名称 || '';
    // 重置阶段上下文：每个项目命名空间获得独立的阶段设定权
    // 跨项目加载场景：被加载文件设了阶段二，主文件调设置项目名称后可设阶段一
    当前阶段 = null;
  },

  /**
   * 加载其他项目的实现纲要数据文件（跨项目引用）。
   * 优先使用同步 XHR 读取；若 XHR 被 CORS 拦截（file:// 协议下常见），
   * 回退到 document.write 注入 <script> 标签——浏览器可通过 <script src>
   * 加载本地文件（不受 CORS 限制）。document.write 的 <script src> 虽然异步，
   * 但后续注入的内联 <script> 会在外部脚本加载后执行，因此在内联脚本中
   * 调用外部 执行工作数据() 并触发重渲染。
   * 加载的 .data.js 文件开头声明 const api = 实现纲要;，通过全局 window.实现纲要 访问 API。
   * 必须在编写本项目数据之前调用（区域1），以便加载的类型在引用时已存在于数据仓库中。
   * @param {string} 文件路径 — 相对于 HTML 文件所在目录的路径
   */
  加载数据(文件路径) {
    // 方式1：同步 XHR（需要 --allow-file-access-from-files 或 http:// 协议）
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 文件路径, false);  // 同步
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        // 加载的数据文件定义了 function 执行工作数据()，此处执行后立即调用
        new Function(xhr.responseText + '\n执行工作数据();')();
        return;
      }
    } catch (e) {
      // XHR 失败（file:// 下 CORS 拦截）——尝试回退
    }

    // 方式2：document.write 注入 <script src> + 内联回调
    // file:// 协议下 <script src> 不受 CORS 限制，可加载本地文件。
    // document.write 在页面解析期间可将内容插入到当前脚本位置之后。
    // 虽然外部 <script src> 异步加载，但紧随其后的内联 <script>
    // 会在外部脚本执行完毕后才执行——因此可在内联脚本中调用外部
    // 执行工作数据() 并刷新视图。
    try {
      // 保存主项目的 执行工作数据 引用，供回调恢复
      window._加载数据_原函数 = window.执行工作数据;
      // 注入外部脚本 + 内联回调脚本
      // 回调脚本在外部脚本加载后执行：调用外部执行工作数据，恢复原函数，刷新视图
      document.write('<script src="' + 文件路径 + '"><\/script>');
      document.write('<script>' +
        'try{' +
          'var _ext=window.执行工作数据;' +
          'if(typeof _ext==="function" && _ext!==window._加载数据_原函数){_ext();}' +
          'window.执行工作数据=window._加载数据_原函数;' +
          'delete window._加载数据_原函数;' +
          'if(typeof 刷新视图==="function"){刷新视图(true);}' +
          'console.log("[加载数据] 外部数据已通过 document.write 加载: ' + 文件路径 + '");' +
        '}catch(e){console.warn("[加载数据] 回调执行异常:",e);}' +
        '<\/script>');
    } catch (e2) {
      console.warn('加载数据失败: ' + 文件路径, e2);
      if (window._加载数据_原函数) delete window._加载数据_原函数;
    }
  },

  // ========== 第一阶段 API ==========

  /**
   * 添加一个节点到图中
   *
   * @param {Object} 配置
   * @param {string} 配置.id
   * @param {string} 配置.名称
   * @param {'class'|'interface'|'struct'|'enum'|'func'|'memberfunc'|'variable'|'membervar'} 配置.类型
   * @param {'高'|'中'|'低'} [配置.置信度='中']
   * @param {string[]} [配置.枚举值] — 仅 enum 类型使用
   * @param {string} [配置.签名] — func/memberfunc 的返回值+参数签名
   * @param {boolean} [配置.是约定类型] — 仅 interface 使用，true=圆形节点，标记为约定类型
   * @param {string} [配置.父节点] — 仅 memberfunc/membervar 必填，指定所属类型节点的 id
   * @returns {Object} 节点代理对象
   */
  添加节点(配置) {
    // 检测是否已调用 设置阶段()
    if (当前阶段 === null) {
      throw new window.实现纲要APIError('❌ 请先调用 api.设置阶段() 设置当前阶段。请重新查看 API 文档。');

    }

    const {
      id,
      名称 = id,
      类型 = 'class',
      置信度 = '中',
      枚举值,
    } = 配置;

    // 校验置信度值，无效值自动纠正为"中"
    const 有效置信度 = ['高', '中', '低'];
    const 校验后置信度 = 有效置信度.includes(置信度) ? 置信度 : '中';
    if (置信度 !== 校验后置信度) {
      throw new window.实现纲要APIError('⚠️ 置信度「' + 置信度 + '」无效。有效值：高/中/低。请重新查看 API 文档。');
    }

    if (!id) {
      throw new window.实现纲要APIError('❌ 添加节点失败：缺少 id 字段。请重新查看 API 文档。');

    }

    if (类型 === 'memberfunc' && !配置.父节点) {
      throw new window.实现纲要APIError('❌ 添加节点失败：memberfunc「' + 名称 + '」必须指定父节点，请用 .添加成员函数() 或传入 父节点 字段。请重新查看 API 文档。');

    }

    if (类型 === 'membervar' && !配置.父节点) {
      throw new window.实现纲要APIError('❌ 添加节点失败：membervar「' + 名称 + '」必须指定父节点，请用 .添加成员变量() 或传入 父节点 字段。请重新查看 API 文档。');

    }

    // 分类映射：variable→变量, membervar→成员变量（与 func/memberfunc 对称）
    const 分类 = 类型 === 'func' ? '函数'
      : 类型 === 'memberfunc' ? '成员函数'
      : 类型 === 'variable' ? '变量'
      : 类型 === 'membervar' ? '成员变量'
      : 类型 === 'enum' ? '枚举'
      : 配置.是约定类型 ? '约定'
      : '类型';

    // 命名空间前缀：设置项目名称后，节点 ID 自动加前缀（如 "项目A.订单"）
    const 完整id = 当前项目名称 ? 当前项目名称 + '.' + id : id;

    const 节点数据 = { id: 完整id, 名称, 类型, 置信度: 校验后置信度, 分类, 所属项目: 当前项目名称 };

    if (配置.是约定类型) 节点数据.是约定类型 = true;
    if (配置.签名) 节点数据.签名 = 配置.签名;
    if (枚举值 && Array.isArray(枚举值)) 节点数据.枚举值 = 枚举值;
    // 变量的数据类型名（如 int、string、Config），用于自动推断依赖关系和显示
    if ((类型 === 'variable' || 类型 === 'membervar') && 配置.类型名) {
      节点数据.类型名 = 配置.类型名;
    }
    数据仓库.节点.set(完整id, 节点数据);
    节点分类.set(完整id, 分类);

    if (!数据仓库.节点成员函数.has(完整id)) 数据仓库.节点成员函数.set(完整id, []);
    if (!数据仓库.节点成员变量.has(完整id)) 数据仓库.节点成员变量.set(完整id, []);
    if (!数据仓库.节点约束.has(完整id)) 数据仓库.节点约束.set(完整id, []);

    刷新视图(true);


    const 节点代理 = {
      get id() { return 完整id; },
      get 名称() { return 名称; },

      添加成员函数(...args) {
        return window.实现纲要._添加成员函数(完整id, ...args);
      },

      批量添加成员函数(函数配置数组) {
        if (!Array.isArray(函数配置数组)) {
          // 支持变参调用：逐参数传入配置对象而非数组
          函数配置数组 = Array.from(arguments);
        }
        return window.实现纲要._批量添加成员函数(完整id, 函数配置数组);
      },

      // 成员变量：与成员函数对称，自动创建 membervar 节点 + 拥有边
      添加成员变量(...args) {
        return window.实现纲要._添加成员变量(完整id, ...args);
      },

      批量添加成员变量(变量配置数组) {
        if (!Array.isArray(变量配置数组)) {
          变量配置数组 = Array.from(arguments);
        }
        return window.实现纲要._批量添加成员变量(完整id, 变量配置数组);
      },

      设置签名(签名文本) {
        return window.实现纲要._设置签名(完整id, 签名文本);
      },

      附加约定(约定类型id) {
        return window.实现纲要.附加约定(完整id, 约定类型id);
      },

      添加约束(约束配置) {
        return window.实现纲要._添加约束(完整id, 约束配置);
      },

      // engine-v3 新增方法
      添加变量(配置) {
        if (!配置 || typeof 配置 !== 'object') {
          throw new window.实现纲要APIError('❌ 添加变量失败：配置参数不能为空。请重新查看 API 文档。');

        }
        const 类型值 = 配置.类型;
        const 名称值 = 配置.名称;
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          if (!类型值 || !名称值) {
            throw new window.实现纲要APIError('❌ 第二阶段 添加变量() 必须同时提供名称和类型。请重新查看 API 文档。');

          }
        }
        // 统一调用 _添加成员变量，让它处理节点创建、拥有边和自动依赖推断
        return window.实现纲要._添加成员变量(完整id, 配置);
      },

      添加测试(配置) {
        const 节点数据 = 数据仓库.节点.get(完整id);
        if (!节点数据) return -1;
        if (!配置) {
          throw new window.实现纲要APIError('❌ 添加测试失败：配置参数不能为空。请重新查看 API 文档。');
        }
        if (!配置.标题 || typeof 配置.标题 !== 'string') {
          throw new window.实现纲要APIError('❌ 添加测试失败：测试项必须提供非空字符串标题。当前值: ' + JSON.stringify(配置.标题) + '。请重新查看 API 文档。');
        }

        if (!节点数据._测试项) 节点数据._测试项 = [];
        节点数据._测试项.push({ 标题: 配置.标题 });
        return 节点数据._测试项.length - 1;
      },

      // ========== 关系便捷方法（v3 按类型分化） ==========

      拥有(目标代理) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置[拥有]关系，该关系由引擎自动推断。请重新查看 API 文档。');

        }
        this.设置关系(目标代理, '拥有');
      },

      继承(目标代理) {
        this.设置关系(目标代理, '继承');
      },

      实现(目标代理) {
        this.设置关系(目标代理, '实现');
      },

      符合约定(目标代理) {
        this.设置关系(目标代理, '符合约定');
      },

      符合(目标代理) {
        this.设置关系(目标代理, '符合');
      },

      调用(目标代理) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置[调用]关系，该关系由引擎自动推断。请重新查看 API 文档。');

        }
        this.设置关系(目标代理, '调用');
      },

      依赖(目标代理) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置[依赖]关系，该关系由引擎自动推断。请重新查看 API 文档。');

        }
        this.设置关系(目标代理, '依赖');
      },

      设置关系(目标代理, 关系类型) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          if ([边类型.拥有, 边类型.调用, 边类型.依赖].includes(关系类型)) {
            throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置: ' + 关系类型 + '，该关系由引擎自动推断。请重新查看 API 文档。');

          }
        }
        const 目标id = typeof 目标代理 === 'string' ? 解析节点ID(目标代理) : 目标代理.id;
        window.实现纲要.添加边({ 源id: 完整id, 目标id, 关系类型: 关系类型 });
      },

      添加关系(目标代理, 关系类型) {
        this.设置关系(目标代理, 关系类型);
      },

      用到的变量(v) {
        if (!this._用到的变量) this._用到的变量 = [];
        const 变量id = typeof v === 'string' ? 解析节点ID(v) : v.id;
        this._用到的变量.push(变量id);
        // 自动推断依赖关系：函数用到某个变量 → 函数依赖该变量 + 函数依赖变量的类型
        if (数据仓库.节点.has(变量id)) {
          const 变量节点 = 数据仓库.节点.get(变量id);
          const 变量类型名 = 变量节点.类型名 || 变量节点.类型 || '';
          // 变量类型如果是已有的类型节点，创建函数→类型的依赖边
          const 解析后类型名 = 变量类型名 ? 解析节点ID(变量类型名) : 变量类型名;
          if (变量类型名 && 数据仓库.节点.has(解析后类型名)) {
            const depKey = `${完整id}->${解析后类型名}`;
            const dep现有边数组 = 数据仓库.边.get(depKey) || [];
            if (!dep现有边数组.some(e => e.关系类型 === '依赖')) {
              dep现有边数组.push({ source: 完整id, target: 解析后类型名, 关系类型: '依赖', 标签: '用到变量类型' });
              数据仓库.边.set(depKey, dep现有边数组);
            }
          }
          // 创建函数→变量的依赖边（二阶段唯一合法的函数→变量依赖方式）
          const varDepKey = `${完整id}->${变量id}`;
          const varDep现有边数组 = 数据仓库.边.get(varDepKey) || [];
          if (!varDep现有边数组.some(e => e.关系类型 === '依赖')) {
            varDep现有边数组.push({ source: 完整id, target: 变量id, 关系类型: '依赖', 标签: '用到' });
            数据仓库.边.set(varDepKey, varDep现有边数组);
          }
        }
      },

      获取约束() {
        return 数据仓库.节点约束.get(完整id) || [];
      },
    };

    return 节点代理;
  },

  /**
   * 添加一条有向边
   *
   * @param {Object} 配置
   * @param {string} 配置.源id
   * @param {string} 配置.目标id
   * @param {'拥有'|'继承'|'符合约定'|'符合'|'调用'|'依赖'} 配置.关系类型
   * @param {string} [配置.标签]
   */
  添加边(配置) {
    const 源id = 解析节点ID(配置.源id);
    const 目标id = 解析节点ID(配置.目标id);
    const { 关系类型 = '拥有', 标签 = '' } = 配置;

    if (!源id || !目标id) {
      throw new window.实现纲要APIError('❌ 添加边失败：缺少 源id 或 目标id。请重新查看 API 文档。');
    }

    const key = `${源id}->${目标id}`;
    // 语义校验：函数之间不能用"拥有"（应用"触发"表示调用）
    const 源分类 = 节点分类.get(源id);
    const 目标分类 = 节点分类.get(目标id);
    if ((源分类 === '函数' || 源分类 === '成员函数') && (目标分类 === '函数' || 目标分类 === '成员函数') && 关系类型 === '拥有') {
      throw new window.实现纲要APIError('❌ 添加边失败：函数->函数不能用拥有。「' + 源id + '」->「' + 目标id + '」应该用调用（调用关系）。请重新查看 API 文档。');
    }

    // 同一对节点支持多条边（不同关系类型）
    const 边数组 = 数据仓库.边.get(key) || [];
    const 现有索引 = 边数组.findIndex(e => e.关系类型 === 关系类型);
    const 新边 = { source: 源id, target: 目标id, 关系类型, 标签 };
    if (现有索引 >= 0) {
      边数组[现有索引] = 新边;
    } else {
      边数组.push(新边);
    }
    数据仓库.边.set(key, 边数组);

    if (关系类型 === '符合' || 关系类型 === '调用') {
      约定边集合.add(key);
    }

    刷新视图(true);
  },

  /**
   * 设置节点的责任映射
   *
   * @param {string} 节点id
   * @param {string} 职责描述
   * @param {string[]} [对应需求条目=[]]
   */
  设置责任映射(节点id, 职责描述, 对应需求条目 = []) {
    节点id = 解析节点ID(节点id);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('❌ 设置责任映射失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }

    if (typeof 职责描述 !== 'string' || !职责描述.trim()) {
      throw new window.实现纲要APIError('❌ 设置责任映射失败：职责描述 参数必须是非空字符串。当前值: ' + JSON.stringify(职责描述) + '。请重新查看 API 文档。');
    }
    // 规范化：支持字符串或数组
    // 校验职责描述：不应是长段中文句子（通常应为简短的责任标识或关键短语）
    if (typeof 职责描述 === 'string' && 职责描述.length > 50 && /[\u4e00-\u9fff]/.test(职责描述)) {
      throw new window.实现纲要APIError('设置责任映射失败：职责描述参数过长（' + 职责描述.length + '字符）且包含中文，疑似将详细描述误填入职责描述字段。职责描述应为简短标识或关键短语（≤50字符）。请重新查看 API 文档。');
    }
    // 校验：职责描述不应是纯英文/数字标识符（如 REQ-001），而对应需求条目是长段中文——参数顺序颠倒
    // 典型错误：api.设置责任映射('节点', 'REQ-001', '长段中文描述') —— 职责描述应为中文简短标识
    if (typeof 职责描述 === 'string' && typeof 对应需求条目 === 'string') {
      const 职责是纯标识符 = /^([A-Za-z0-9_-]{3,30})$/.test(职责描述);
      const 对应是长中文 = /[\u4e00-\u9fff]/.test(对应需求条目) && 对应需求条目.length > 10;
      if (职责是纯标识符 && 对应是长中文) {
        throw new window.实现纲要APIError('设置责任映射参数顺序颠倒：职责描述（「' + 职责描述 + '」）是纯标识符而非中文简短标识，对应需求条目（「' + 对应需求条目.substring(0,30) + '...」）是长段中文描述。正确格式：api.设置责任映射(节点id, 职责描述中文简短标识, 对应需求条目)。请重新查看 API 文档。');
      }
    }
    // 校验：职责描述和对应需求条目不应同时为长段中文（参数可能颠倒或重复填入）
    if (typeof 职责描述 === 'string' && typeof 对应需求条目 === 'string' && 对应需求条目.length > 10 && 职责描述.length > 10 && /[\u4e00-\u9fff]/.test(职责描述) && /[\u4e00-\u9fff]/.test(对应需求条目)) {
      throw new window.实现纲要APIError('设置责任映射参数异常：职责描述（「' + 职责描述.substring(0,30) + '...」）和对应需求条目（「' + 对应需求条目.substring(0,30) + '...」）均为长段中文，疑似参数顺序颠倒。请重新查看 API 文档。');
    }
    const 规范化需求条目 = Array.isArray(对应需求条目) ? 对应需求条目 : (对应需求条目 ? [对应需求条目] : []);
    数据仓库.责任映射.set(节点id, { 职责描述, 对应需求条目: 规范化需求条目 });
    刷新视图(true);
  },

  /**
   * 设置分组：将一组节点归类到命名组中
   * 组不能为空、组名不能为空、组内节点必须存在
   * 不同组可以有交集（同一节点可属于多个组）
   * 支持组嵌套：组成员可以是普通节点，也可以是已存在的组（用 组::组名 或直接组名 引用）
   * @param {string} 组名 - 分组名称（非空）
   * @param {string[]} 节点id数组 - 组成员 id 列表（非空，可以是普通节点 id 或 组::组名）
   */
  设置分组(组名, 节点id数组) {
    if (!组名 || typeof 组名 !== 'string') {
      throw new window.实现纲要APIError('❌ 设置分组失败：组名不能为空。请重新查看 API 文档。');
    }
    if (!Array.isArray(节点id数组) || 节点id数组.length === 0) {
      throw new window.实现纲要APIError('❌ 设置分组失败：组「' + 组名 + '」的节点列表不能为空。请重新查看 API 文档。');
    }
    // 校验：每个 id 必须是已存在的普通节点或已存在的组
    const 无效节点 = 节点id数组.filter(id => {
      const 解析后 = 解析节点ID(id);
      if (数据仓库.节点.has(解析后)) return false;       // 普通节点
      const 引用组名 = id.startsWith('组::') ? id.substring(3) : id;
      if (数据仓库.分组.has(引用组名)) return false;  // 已存在的组
      return true;                                    // 无效
    });
    if (无效节点.length > 0) {
      throw new window.实现纲要APIError('❌ 设置分组失败：组「' + 组名 + '」包含不存在的节点或组: ' + 无效节点.join(', ') + '。请重新查看 API 文档。');
    }
    // 将组引用统一为 组::组名 形式存储
    const 规范化成员 = 节点id数组.map(id => {
      const 解析后 = 解析节点ID(id);
      if (数据仓库.节点.has(解析后)) return 解析后;
      return id.startsWith('组::') ? id : `组::${id}`;
    });
    数据仓库.分组.set(组名, new Set(规范化成员));
    刷新视图(true);
  },

  /**
   * 导出当前图的完整数据
   * @returns {Object}
   */
  导出数据() {
    // 将边数组展开为扁平列表
    const 所有边 = [];
    for (const 边数组 of 数据仓库.边.values()) {
      for (const 边 of 边数组) {
        所有边.push({ ...边 });
      }
    }
    const 导出 = {
      节点: Array.from(数据仓库.节点.values()),
      边: 所有边,
      责任映射: Array.from(数据仓库.责任映射.entries()).map(([节点id, v]) => ({ 节点id, ...v })),
      成员函数: Array.from(数据仓库.节点成员函数.entries()).map(([节点id, 函数列表]) => ({ 节点id, 函数列表 })),
      成员变量: Array.from(数据仓库.节点成员变量.entries()).map(([节点id, 变量列表]) => ({ 节点id, 变量列表 })),
      约束: Array.from(数据仓库.节点约束.entries()).map(([节点id, 约束列表]) => ({ 节点id, 约束列表 })),
    };
    return 导出;
  },

  // ========== 内部方法 ==========

  添加成员函数(节点id, ...args) {
    节点id = 解析节点ID(节点id);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('添加成员函数失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    return this._添加成员函数(节点id, ...args);
  },

  _添加成员函数(节点id, 函数配置, ...剩余参数) {
    if (typeof 函数配置 === 'string') {
      函数配置 = {
        函数名: 函数配置,
        职责: 剩余参数[0] || '',
        对应需求条目: 剩余参数[1] || [],
        有签名: 剩余参数[2] || false,
        签名提示: 剩余参数[3] || ''
      };
    }
    const { 函数名, 名称, 职责, 对应需求条目, 有签名 = false, 签名提示 = '', 调用 = [] } = 函数配置;
    // 兼容：名称 作为 函数名 的别名（demo 中使用 名称）
    const 实际函数名 = 函数名 || 名称;
    // 规范化：对应需求条目 支持字符串或数组
    const 规范化条目 = Array.isArray(对应需求条目) ? 对应需求条目 : (对应需求条目 ? [对应需求条目] : []);
    // 规范化：调用 支持字符串、数组、代理对象
    const 规范化调用 = Array.isArray(调用) ? 调用 : (调用 ? [调用] : []);

    if (!实际函数名) {
      throw new window.实现纲要APIError('❌ 添加成员函数失败：缺少 函数名。请重新查看 API 文档。');
    }
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('❌ 添加成员函数失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    检查修改权限(节点id);

    const 列表 = 数据仓库.节点成员函数.get(节点id) || [];
    列表.push({ 函数名: 实际函数名, 职责, 对应需求条目: 规范化条目, 有签名, 签名提示 });
    数据仓库.节点成员函数.set(节点id, 列表);

    const mfNodeId = `${节点id}.${实际函数名}`;
    if (!数据仓库.节点.has(mfNodeId)) {
      const 父节点置信度 = (数据仓库.节点.get(节点id) || {}).置信度 || '中';
      数据仓库.节点.set(mfNodeId, { id: mfNodeId, 名称: 实际函数名, 类型: 'memberfunc', 置信度: 父节点置信度, 分类: '成员函数', 所属项目: 当前项目名称 });
      节点分类.set(mfNodeId, '成员函数');
      if (!数据仓库.节点成员函数.has(mfNodeId)) 数据仓库.节点成员函数.set(mfNodeId, []);
      if (!数据仓库.节点约束.has(mfNodeId)) 数据仓库.节点约束.set(mfNodeId, []);
      const edgeKey = `${节点id}->${mfNodeId}`;
      const 现有边数组 = 数据仓库.边.get(edgeKey) || [];
      if (!现有边数组.some(e => e.关系类型 === '拥有')) {
        现有边数组.push({ source: 节点id, target: mfNodeId, 关系类型: '拥有', 标签: '成员' });
        数据仓库.边.set(edgeKey, 现有边数组);
      }
      // 自动推断依赖关系：从签名提示中解析返回值类型和参数类型
      // 签名格式：返回值类型 (参数1类型, 参数2类型, ...)
      if (有签名 && 签名提示) {
        const 解析类型引用 = (类型字符串) => {
          if (!类型字符串) return [];
          const 结果 = [];
          // 移除指针符号(*)、引用符号(&)、const 等修饰符，提取核心类型名
          const 清理后 = 类型字符串
            .replace(/\bconst\b/g, '')
            .replace(/\bstatic\b/g, '')
            .replace(/[*&]/g, '')
            .trim();
          if (清理后 && 清理后.length > 0) {
            结果.push(清理后);
          }
          return 结果;
        };
        
        // 解析返回值类型（括号前的部分）
        const 括号索引 = 签名提示.indexOf('(');
        if (括号索引 > 0) {
          const 返回值类型 = 签名提示.substring(0, 括号索引).trim();
          const 返回类型列表 = 解析类型引用(返回值类型);
          返回类型列表.forEach(类型名 => {
            const 解析后 = 解析节点ID(类型名);
            if (数据仓库.节点.has(解析后)) {
              const depKey = `${mfNodeId}->${解析后}`;
              const dep现有边数组 = 数据仓库.边.get(depKey) || [];
              if (!dep现有边数组.some(e => e.关系类型 === '依赖')) {
                dep现有边数组.push({ source: mfNodeId, target: 解析后, 关系类型: '依赖', 标签: '返回值' });
                数据仓库.边.set(depKey, dep现有边数组);
              }
            }
          });
          
          // 解析参数类型（括号内的部分）
          const 闭括号索引 = 签名提示.lastIndexOf(')');
          if (闭括号索引 > 括号索引) {
            const 参数部分 = 签名提示.substring(括号索引 + 1, 闭括号索引).trim();
            if (参数部分) {
              const 参数列表 = 参数部分.split(',').map(s => s.trim()).filter(s => s.length > 0);
              参数列表.forEach(参数字符串 => {
                const 参数类型列表 = 解析类型引用(参数字符串);
                参数类型列表.forEach(类型名 => {
                  const 解析后 = 解析节点ID(类型名);
                  if (数据仓库.节点.has(解析后)) {
                    const depKey = `${mfNodeId}->${解析后}`;
                    const dep现有边数组 = 数据仓库.边.get(depKey) || [];
                    if (!dep现有边数组.some(e => e.关系类型 === '依赖')) {
                      dep现有边数组.push({ source: mfNodeId, target: 解析后, 关系类型: '依赖', 标签: '参数' });
                      数据仓库.边.set(depKey, dep现有边数组);
                    }
                  }
                });
              });
            }
          }
        }
      }
    }

    // 处理调用关系（通过配置声明，第二阶段也允许）
    if (规范化调用.length > 0) {
      规范化调用.forEach(目标 => {
        const 原始id = typeof 目标 === 'string' ? 目标 : 目标.id;
        const 目标id = 解析节点ID(原始id);
        if (目标id && 数据仓库.节点.has(目标id)) {
          const callKey = `${mfNodeId}->${目标id}`;
          const call现有边数组 = 数据仓库.边.get(callKey) || [];
          if (!call现有边数组.some(e => e.关系类型 === '调用')) {
            call现有边数组.push({ source: mfNodeId, target: 目标id, 关系类型: '调用', 标签: '调用' });
            数据仓库.边.set(callKey, call现有边数组);
          }
        }
      });
    }

    const 签名后缀 = 有签名 ? `(${签名提示})` : '(…)';
    刷新视图(true);

    // 返回成员函数代理，支持链式调用（如 成员函数代理.调用(其他函数)）
    return {
      get id() { return mfNodeId; },
      get 名称() { return 实际函数名; },
      添加测试(配置) {
        const 节点数据 = 数据仓库.节点.get(mfNodeId);
        if (!节点数据) return -1;
        if (!配置) {
          throw new window.实现纲要APIError('❌ 添加测试失败：配置参数不能为空。请重新查看 API 文档。');
        }
        if (!配置.标题 || typeof 配置.标题 !== 'string') {
          throw new window.实现纲要APIError('❌ 添加测试失败：测试项必须提供非空字符串标题。当前值: ' + JSON.stringify(配置.标题) + '。请重新查看 API 文档。');
        }

        if (!节点数据._测试项) 节点数据._测试项 = [];
        节点数据._测试项.push({ 标题: 配置.标题 });
        return 节点数据._测试项.length - 1;
      },
      添加约束(约束配置) {
        return window.实现纲要._添加约束(mfNodeId, 约束配置);
      },
      调用(目标代理) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置[调用]关系，该关系由引擎自动推断。请重新查看 API 文档。');

        }
        return window.实现纲要._设置关系(mfNodeId, 目标代理, '调用');
      },
      依赖(目标代理) {
        if (当前阶段 === 阶段.接口分化 || 当前阶段 === 阶段.实现约定) {
          throw new window.实现纲要APIError('❌ 第二阶段不允许手动设置[依赖]关系，该关系由引擎自动推断。请重新查看 API 文档。');

        }
        return window.实现纲要._设置关系(mfNodeId, 目标代理, '依赖');
      },
      添加关系(目标代理, 关系类型) {
        return window.实现纲要._设置关系(mfNodeId, 目标代理, 关系类型);
      },
      用到的变量(v) {
        if (!this._用到的变量) this._用到的变量 = [];
        const 变量id = typeof v === 'string' ? 解析节点ID(v) : v.id;
        this._用到的变量.push(变量id);
        // 自动推断依赖关系：成员函数用到某个变量 → 成员函数依赖该变量 + 成员函数依赖变量的类型
        if (数据仓库.节点.has(变量id)) {
          const 变量节点 = 数据仓库.节点.get(变量id);
          const 变量类型名 = 变量节点.类型名 || 变量节点.类型 || '';
          // 变量类型如果是已有的类型节点，创建成员函数→类型的依赖边
          const 解析后类型名 = 变量类型名 ? 解析节点ID(变量类型名) : 变量类型名;
          if (变量类型名 && 数据仓库.节点.has(解析后类型名)) {
            const depKey = `${mfNodeId}->${解析后类型名}`;
            const dep现有边数组 = 数据仓库.边.get(depKey) || [];
            if (!dep现有边数组.some(e => e.关系类型 === '依赖')) {
              dep现有边数组.push({ source: mfNodeId, target: 解析后类型名, 关系类型: '依赖', 标签: '用到变量类型' });
              数据仓库.边.set(depKey, dep现有边数组);
            }
          }
          // 创建成员函数→变量的依赖边（二阶段唯一合法的函数→变量依赖方式）
          const varDepKey = `${mfNodeId}->${变量id}`;
          const varDep现有边数组 = 数据仓库.边.get(varDepKey) || [];
          if (!varDep现有边数组.some(e => e.关系类型 === '依赖')) {
            varDep现有边数组.push({ source: mfNodeId, target: 变量id, 关系类型: '依赖', 标签: '用到' });
            数据仓库.边.set(varDepKey, varDep现有边数组);
          }
        }
      },
    };
  },

  _批量添加成员函数(节点id, 函数配置数组) {
    函数配置数组.forEach(配置 => {
      window.实现纲要._添加成员函数(节点id, 配置);
    });
  },

  // ========== 成员变量内部方法 ==========
  // 与 _添加成员函数 对称：自动创建 membervar 节点 + 拥有边
  // 节点 id 格式：${父id}.${变量名}（与 memberfunc 一致）
  _添加成员变量(节点id, 变量配置, ...剩余参数) {
    // 兼容字符串调用：_添加成员变量(节点id, '变量名', '类型', '职责', [需求条目])
    if (typeof 变量配置 === 'string') {
      变量配置 = {
        变量名: 变量配置,
        类型: 剩余参数[0] || '',
        职责: 剩余参数[1] || '',
        对应需求条目: 剩余参数[2] || [],
      };
    }
    const { 变量名, 名称, 类型 = '', 职责 = '', 对应需求条目 = [] } = 变量配置;
    // 兼容：名称 作为 变量名 的别名（demo 中使用 名称）
    const 实际变量名 = 变量名 || 名称;

    if (!实际变量名) {
      throw new window.实现纲要APIError('❌ 添加成员变量失败：缺少 变量名。请重新查看 API 文档。');
    }
    节点id = 解析节点ID(节点id);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('❌ 添加成员变量失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    检查修改权限(节点id);

    const 列表 = 数据仓库.节点成员变量.get(节点id) || [];
    列表.push({ 变量名: 实际变量名, 类型, 职责, 对应需求条目 });
    数据仓库.节点成员变量.set(节点id, 列表);

    const mvNodeId = `${节点id}.${实际变量名}`;
    if (!数据仓库.节点.has(mvNodeId)) {
      const 父节点置信度 = (数据仓库.节点.get(节点id) || {}).置信度 || '中';
      数据仓库.节点.set(mvNodeId, { id: mvNodeId, 名称: 实际变量名, 类型: 'membervar', 置信度: 父节点置信度, 分类: '成员变量', 类型名: 类型, 所属项目: 当前项目名称 });
      节点分类.set(mvNodeId, '成员变量');
      if (!数据仓库.节点成员函数.has(mvNodeId)) 数据仓库.节点成员函数.set(mvNodeId, []);
      if (!数据仓库.节点成员变量.has(mvNodeId)) 数据仓库.节点成员变量.set(mvNodeId, []);
      if (!数据仓库.节点约束.has(mvNodeId)) 数据仓库.节点约束.set(mvNodeId, []);
      // 自动创建拥有边：父类型 → 成员变量
      const edgeKey = `${节点id}->${mvNodeId}`;
      const 现有边数组 = 数据仓库.边.get(edgeKey) || [];
      if (!现有边数组.some(e => e.关系类型 === '拥有')) {
        现有边数组.push({ source: 节点id, target: mvNodeId, 关系类型: '拥有', 标签: '成员变量' });
        数据仓库.边.set(edgeKey, 现有边数组);
      }
      // 自动推断依赖关系：成员变量类型如果是已有的类型节点，自动创建依赖边
      // 例如：认证服务有成员变量"令牌管理器"类型为"令牌管理器" → 成员变量依赖令牌管理器类型
      if (类型 && 类型.trim()) {
        const 类型名 = 类型.trim();
        // 检查是否有同名的类型节点（精确匹配 + 命名空间自动补全）
        const 解析后类型 = 解析节点ID(类型名);
        const 目标节点 = 数据仓库.节点.get(解析后类型);
        if (目标节点) {
          const depEdgeKey = `${mvNodeId}->${解析后类型}`;
          const dep现有边数组 = 数据仓库.边.get(depEdgeKey) || [];
          if (!dep现有边数组.some(e => e.关系类型 === '依赖')) {
            dep现有边数组.push({ source: mvNodeId, target: 解析后类型, 关系类型: '依赖', 标签: '类型依赖' });
            数据仓库.边.set(depEdgeKey, dep现有边数组);
          }
        }
      }
    }

    刷新视图(true);

    // 返回成员变量代理，支持链式调用
    return {
      get id() { return mvNodeId; },
      get 名称() { return 实际变量名; },
      添加测试(配置) {
        const 节点数据 = 数据仓库.节点.get(mvNodeId);
        if (!节点数据) return -1;
        if (!配置) {
          throw new window.实现纲要APIError('❌ 添加测试失败：配置参数不能为空。请重新查看 API 文档。');
        }
        if (!配置.标题 || typeof 配置.标题 !== 'string') {
          throw new window.实现纲要APIError('❌ 添加测试失败：测试项必须提供非空字符串标题。当前值: ' + JSON.stringify(配置.标题) + '。请重新查看 API 文档。');
        }

        if (!节点数据._测试项) 节点数据._测试项 = [];
        节点数据._测试项.push({ 标题: 配置.标题 });
        return 节点数据._测试项.length - 1;
      },
      添加约束(约束配置) {
        return window.实现纲要._添加约束(mvNodeId, 约束配置);
      },
      添加关系(目标代理, 关系类型) {
        return window.实现纲要._设置关系(mvNodeId, 目标代理, 关系类型);
      },
    };
  },

  _批量添加成员变量(节点id, 变量配置数组) {
    变量配置数组.forEach(配置 => {
      window.实现纲要._添加成员变量(节点id, 配置);
    });
  },

  _设置签名(节点id, 签名文本) {
    节点id = 解析节点ID(节点id);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('❌ 设置签名失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    检查修改权限(节点id);
    数据仓库.节点.get(节点id).签名 = 签名文本;
    刷新视图(true);
  },

  _添加约束(节点id, 约束配置) {
    const { 条件, 被约束方 = '', 触发效果, 来源步骤 = 3 } = 约束配置;

    if (!条件) {
      throw new window.实现纲要APIError('❌ 添加约束失败：缺少 条件 字段。请重新查看 API 文档。');
    }
    节点id = 解析节点ID(节点id);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('❌ 添加约束失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    检查修改权限(节点id);

    const 列表 = 数据仓库.节点约束.get(节点id) || [];
    列表.push({ 条件, 被约束方, 触发效果, 来源步骤 });
    数据仓库.节点约束.set(节点id, 列表);

    刷新视图(true);
  },

  /**
   * 内部方法：设置节点间关系。供代理对象调用。
   */
  _设置关系(源节点id, 目标代理, 关系类型) {
    const 目标id = typeof 目标代理 === 'string' ? 解析节点ID(目标代理) : 目标代理.id;
    this.添加边({ 源id: 源节点id, 目标id, 关系类型 });
  },

  添加约束(配置, ...args) {
    // 兼容两种调用：对象含节点id / 分开传
    if (typeof 配置 === 'object' && 配置.节点id) {
      const 节点id = 解析节点ID(配置.节点id);
      if (!数据仓库.节点.has(节点id)) {
        throw new window.实现纲要APIError('添加约束失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
      }
      return this._添加约束(节点id, 配置);
    }
    // 分开传：配置是节点 id 字符串
    const 节点id = 解析节点ID(配置);
    if (!数据仓库.节点.has(节点id)) {
      throw new window.实现纲要APIError('添加约束失败：节点「' + 节点id + '」不存在。请重新查看 API 文档。');
    }
    return this._添加约束(节点id, ...args);
  },

  添加约定边(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加约定边失败：配置参数不能为空。请重新查看 API 文档。');
    }
    const 源id = 解析节点ID(配置.源id || 配置.普通节点id);
    if (!数据仓库.节点.has(源id)) {
      throw new window.实现纲要APIError('添加约定边失败：源节点「' + (配置.源id || 配置.普通节点id || '未知') + '」不存在。请重新查看 API 文档。');
    }
    window.实现纲要.添加边({ ...配置, 关系类型: 配置.关系类型 || '符合' });
  },

  /**
   * 将普通类型/函数绑定到约定类型
   * 一次调用完成：标记约定类型 + 创建约定依赖边 + 给源节点加约定标记
   *
   * @param {string} 普通节点id — 要求方（类型/函数）
   * @param {string} 约定类型id — 被要求方（约定类型）
   */
  附加约定(普通节点id, 约定类型id) {
    普通节点id = 解析节点ID(普通节点id);
    约定类型id = 解析节点ID(约定类型id);
    if (!数据仓库.节点.has(普通节点id)) {
      throw new window.实现纲要APIError('❌ 附加约定失败：节点「' + 普通节点id + '」不存在。请重新查看 API 文档。');
    }
    if (!数据仓库.节点.has(约定类型id)) {
      throw new window.实现纲要APIError('❌ 附加约定失败：约定类型「' + 约定类型id + '」不存在。请重新查看 API 文档。');
    }
    检查修改权限(普通节点id);

    // 1. 标记目标为约定类型
    const 约定节点 = 数据仓库.节点.get(约定类型id);
    约定节点.是约定类型 = true;
    节点分类.set(约定类型id, '约定');
    数据仓库.节点.set(约定类型id, 约定节点);

    // 2. 给源节点加约定标记（橙色阴影）
    const 普通节点 = 数据仓库.节点.get(普通节点id);
    if (!普通节点.已附加约定) 普通节点.已附加约定 = [];
    if (!普通节点.已附加约定.includes(约定类型id)) {
      普通节点.已附加约定.push(约定类型id);
      数据仓库.节点.set(普通节点id, 普通节点);
    }

    // 3. 创建约定依赖边
    const edgeKey = `${普通节点id}->${约定类型id}`;
    const 现有边数组 = 数据仓库.边.get(edgeKey) || [];
    if (!现有边数组.some(e => e.关系类型 === '符合约定')) {
      现有边数组.push({ source: 普通节点id, target: 约定类型id, 关系类型: '符合约定', 标签: '' });
      数据仓库.边.set(edgeKey, 现有边数组);
      约定边集合.add(edgeKey);
    }

    刷新视图(true);
  },

  _调试状态() {
    console.group('🔍 数据仓库状态');
    console.table(Array.from(数据仓库.节点.values()));
    console.table(Array.from(数据仓库.边.values()));
    console.groupEnd();
  },
  // ========== engine-v3 新增 API ==========

  /**
   * 设置当前阶段。必须在创建任何节点之前调用。
   */
  设置阶段(阶段值) {
    if (阶段值 !== '阶段一' && 阶段值 !== '阶段二' && 阶段值 !== '阶段三') {
      throw new window.实现纲要APIError('❌ 设置阶段失败：无效的阶段值「' + 阶段值 + '」。有效值：阶段一/阶段二/阶段三。请重新查看 API 文档。');
    }
    // 允许重复设置相同阶段（项目内重复调用）
    // 跨项目不同阶段由 设置项目名称() 重置 当前阶段=null 处理
    if (当前阶段 === 阶段值) return;
    if (当前阶段 !== null) {
      throw new window.实现纲要APIError('⚠️ 当前阶段已设为 ' + 当前阶段 + '，不能切换为 ' + 阶段值 + '。请重新查看 API 文档。');
    }
    当前阶段 = 阶段值;
    // 更新步骤指示器
    var 步骤1 = document.getElementById('step-1');
    var 步骤2 = document.getElementById('step-2');
    var 步骤3 = document.getElementById('step-3');
    if (步骤1 && 步骤2 && 步骤3) {
      步骤1.style.background = '';
      步骤1.style.fontWeight = 'normal';
      步骤2.style.background = '';
      步骤2.style.fontWeight = 'normal';
      步骤3.style.background = '';
      步骤3.style.fontWeight = 'normal';
      if (阶段值 === '阶段一') {
        步骤1.style.background = '#d4edda';
        步骤1.style.fontWeight = 'bold';
      } else if (阶段值 === '阶段二') {
        步骤1.style.background = '#d4edda';
        步骤1.style.fontWeight = 'bold';
        步骤2.style.background = '#fff3cd';
        步骤2.style.fontWeight = 'bold';
      } else if (阶段值 === '阶段三') {
        步骤1.style.background = '#d4edda';
        步骤1.style.fontWeight = 'bold';
        步骤2.style.background = '#d4edda';
        步骤2.style.fontWeight = 'bold';
        步骤3.style.background = '#cce5ff';
        步骤3.style.fontWeight = 'bold';
      }
    }
  },

  /**
   * 添加自由函数。等价于 添加节点({类型: 'func'})，命名更清晰。
   */
  添加自由函数(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加自由函数失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加自由函数失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'func' });
  },

  // ========== 按类型分化的便利 API（v3 推荐） ==========

  /**
   * 添加类节点。等价于 添加节点({类型: 'class'})。
   * @returns {Object} 类型代理对象
   */
  添加类(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加类失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加类失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'class' });
  },

  /**
   * 添加接口节点。等价于 添加节点({类型: 'interface'})。
   * @returns {Object} 类型代理对象
   */
  添加接口(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加接口失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加接口失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'interface' });
  },

  /**
   * 添加结构体节点。等价于 添加节点({类型: 'struct'})。
   * @returns {Object} 类型代理对象
   */
  添加结构体(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加结构体失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加结构体失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'struct' });
  },

  /**
   * 添加枚举节点。等价于 添加节点({类型: 'enum'})。
   * @returns {Object} 类型代理对象
   */
  添加枚举(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加枚举失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加枚举失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'enum' });
  },

  /**
   * 添加自由函数节点。等价于 添加节点({类型: 'func'})。
   * @returns {Object} 函数代理对象
   */
  添加函数(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('添加函数失败：配置参数不能为空。请重新查看 API 文档。');
    }
    if (!配置.id && !配置.名称) {
      throw new window.实现纲要APIError('添加函数失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...配置, 类型: 'func' });
  },

  /**
   * 添加自由变量节点。等价于 添加节点({类型: 'variable'})。
   * @returns {Object} 变量代理对象
   */
  添加变量(配置) {
    if (!配置 || typeof 配置 !== 'object') {
      throw new window.实现纲要APIError('❌ 添加变量失败：配置参数不能为空。请重新查看 API 文档。');
    }
    const { 类型: 数据类型, ...其他配置 } = 配置;
    if (!其他配置.id && !其他配置.名称) {
      throw new window.实现纲要APIError('❌ 添加变量失败：必须提供 id 或 名称 字段。请重新查看 API 文档。');
    }
    return this.添加节点({ ...其他配置, 类型: 'variable', 类型名: 数据类型 });
  },

  /**
   * 导出全景图。AI 专用工具，导出所有节点/边/约束/功能的完整结构化 JSON。
   */
  导出全景图() {
    const 节点列表 = [];
    for (const [id, node] of 数据仓库.节点) {
      const entry = {
        id: id,
        名称: node.名称 || id,
        类型: node.类型,
        职责: node.职责 || '',
        置信度: node.置信度 || '中',
        对应需求: node.对应需求条目 ? [node.对应需求条目] : [],
        约束: 数据仓库.节点约束.get(id) || [],
        测试项: node._测试项 || [],
      };
      // Add member functions if available
      const 成员函数 = 数据仓库.节点成员函数.get(id);
      if (成员函数) {
        entry.成员函数 = 成员函数;
      }
      节点列表.push(entry);
    }
    const 边列表 = [];
    for (const [key, 边数组] of 数据仓库.边) {
      for (const edge of 边数组) {
        边列表.push({
          源: edge.source || edge.源id || edge.源,
          目标: edge.target || edge.目标id || edge.目标,
          关系类型: edge.关系类型,
        });
      }
    }
    const 分组列表 = [];
    for (const [组名, 成员] of 数据仓库.分组) {
      分组列表.push({ 组名: 组名, 成员: Array.from(成员) });
    }
    return {
      阶段: 当前阶段 || '未设置',
      节点: 节点列表,
      边: 边列表,
      分组: 分组列表,
    };
  },

  /**
   * 导出依赖与需求。为外部插件提供完整的依赖表 + 需求/责任/约束/测试/类型/函数/变量结构化 JSON。
   * 所有关系统一为依赖关系（拥有/继承/调用/符合约定等均视为依赖）。
   * 支持多项目递归：导出当前项目 + 所有依赖项目（含传递依赖），以子项目树形式嵌套。
   */
  导出依赖与需求() {
    // === 1. 构建全局依赖表 + 节点依赖索引 + 项目间依赖关系 ===
    const 全局依赖表 = [];
    const 依赖索引 = new Map();   // 源id -> Set<目标id>
    const 项目依赖 = new Map();   // 项目名 -> Set<依赖项目名>

    for (const 边数组 of 数据仓库.边.values()) {
      for (const 边 of 边数组) {
        全局依赖表.push({ 源: 边.source, 目标: 边.target, 关系: 边.关系类型 || '依赖' });
        if (!依赖索引.has(边.source)) 依赖索引.set(边.source, new Set());
        依赖索引.get(边.source).add(边.target);
        // 检测跨项目依赖
        const 源项目 = 数据仓库.节点.get(边.source)?.所属项目 || '';
        const 目标项目 = 数据仓库.节点.get(边.target)?.所属项目 || '';
        if (源项目 && 目标项目 && 源项目 !== 目标项目) {
          if (!项目依赖.has(源项目)) 项目依赖.set(源项目, new Set());
          项目依赖.get(源项目).add(目标项目);
        }
      }
    }

    // === 2. 按项目分组节点 ===
    const 项目节点 = new Map();   // 项目名 -> [[id, 节点], ...]
    for (const [id, 节点] of 数据仓库.节点) {
      const 项目 = 节点.所属项目 || '';
      if (!项目节点.has(项目)) 项目节点.set(项目, []);
      项目节点.get(项目).push([id, 节点]);
    }

    // === 3. 辅助函数 ===
    const 取依赖 = (节点id) => {
      const 集合 = 依赖索引.get(节点id);
      return 集合 ? Array.from(集合) : [];
    };
    const 取责任 = (节点id) => {
      const 映射 = 数据仓库.责任映射.get(节点id);
      if (!映射) return { 职责: '', 对应需求: [] };
      return {
        职责: 映射.职责描述 || '',
        对应需求: Array.isArray(映射.对应需求条目) ? 映射.对应需求条目 : (映射.对应需求条目 ? [映射.对应需求条目] : []),
      };
    };
    const 取测试项 = (节点) =>
      (节点?._测试项 || []).map(t => (typeof t === 'string' ? t : (t.标题 || '')));
    const 规范需求 = (条目) =>
      Array.isArray(条目) ? 条目 : (条目 ? [条目] : []);

    // === 4. 导出单个项目（递归） ===
    const 导出项目 = (项目名, 已访问) => {
      if (已访问.has(项目名)) return null; // 防止循环引用
      已访问.add(项目名);

      const 该项目节点列表 = 项目节点.get(项目名) || [];
      const 类型列表 = [];
      const 函数列表 = [];
      const 变量列表 = [];
      const 该项目依赖表 = 全局依赖表.filter(e =>
        数据仓库.节点.get(e.源)?.所属项目 === 项目名
      );

      for (const [id, 节点] of 该项目节点列表) {
        const 分类 = 节点分类.get(id);
        const 责任 = 取责任(id);
        const 约束 = 数据仓库.节点约束.get(id) || [];
        const 测试项 = 取测试项(节点);
        const 依赖 = 取依赖(id);
        const 功能拆解 = 节点._功能拆解 || [];

        // 类型节点：class / interface / struct / enum / 约定
        if (分类 === '类型' || 分类 === '枚举' || 分类 === '约定') {
          const 条目 = {
            id, 名称: 节点.名称 || id, 类型: 节点.类型,
            置信度: 节点.置信度 || '中',
            是约定类型: !!节点.是约定类型,
            职责: 责任.职责, 对应需求: 责任.对应需求,
            约束, 测试项, 功能拆解, 依赖,
          };
          if (节点.枚举值) 条目.枚举值 = 节点.枚举值;
          // 成员函数（含其自身的测试/约束/依赖）
          const 成员函数 = 数据仓库.节点成员函数.get(id);
          if (成员函数 && 成员函数.length) {
            条目.成员函数 = 成员函数.map(mf => {
              const 实际函数名 = mf.函数名 || mf.名称 || '';
              const mfNodeId = `${id}.${实际函数名}`;
              return {
                id: mfNodeId, 函数名: 实际函数名,
                职责: mf.职责 || '',
                签名: mf.签名 || mf.签名提示 || '',
                对应需求: 规范需求(mf.对应需求条目),
                约束: 数据仓库.节点约束.get(mfNodeId) || [],
                测试项: 取测试项(数据仓库.节点.get(mfNodeId)),
                依赖: 取依赖(mfNodeId),
              };
            });
          }
          // 成员变量（含其自身的测试/约束/依赖）
          const 成员变量 = 数据仓库.节点成员变量.get(id);
          if (成员变量 && 成员变量.length) {
            条目.成员变量 = 成员变量.map(mv => {
              const 实际变量名 = mv.变量名 || mv.名称 || '';
              const mvNodeId = `${id}.${实际变量名}`;
              return {
                id: mvNodeId, 变量名: 实际变量名,
                类型: mv.类型 || mv.类型名 || '',
                职责: mv.职责 || '',
                对应需求: 规范需求(mv.对应需求条目),
                约束: 数据仓库.节点约束.get(mvNodeId) || [],
                测试项: 取测试项(数据仓库.节点.get(mvNodeId)),
                依赖: 取依赖(mvNodeId),
              };
            });
          }
          类型列表.push(条目);
        }
        // 自由函数节点：func
        else if (分类 === '函数') {
          函数列表.push({
            id, 名称: 节点.名称 || id,
            置信度: 节点.置信度 || '中',
            签名: 节点.签名 || '',
            职责: 责任.职责, 对应需求: 责任.对应需求,
            约束, 测试项, 依赖,
          });
        }
        // 自由变量节点：variable
        else if (分类 === '变量') {
          变量列表.push({
            id, 名称: 节点.名称 || id,
            置信度: 节点.置信度 || '中',
            类型名: 节点.类型名 || '',
            职责: 责任.职责, 对应需求: 责任.对应需求,
            约束, 依赖,
          });
        }
        // 成员函数/成员变量节点：跳过（已在父类型的成员列表中导出）
      }

      // 该项目依赖了哪些外部项目
      const 依赖项目列表 = Array.from(项目依赖.get(项目名) || []);

      // 递归导出依赖项目
      const 子项目 = {};
      for (const dep of 依赖项目列表) {
        const 子导出 = 导出项目(dep, 已访问);
        if (子导出) 子项目[dep] = 子导出;
      }

      return {
        项目: 项目名,
        依赖项目: 依赖项目列表,
        类型: 类型列表,
        函数: 函数列表,
        变量: 变量列表,
        依赖表: 该项目依赖表,
        子项目: 子项目,
      };
    };

    // === 5. 从当前项目开始递归导出 ===
    const 结果 = 导出项目(当前项目名称 || '', new Set());
    if (结果) {
      结果.阶段 = 当前阶段 || '未设置';
      return 结果;
    }
    // 当前项目无数据时的空返回
    return {
      项目: 当前项目名称 || '',
      阶段: 当前阶段 || '未设置',
      依赖项目: [],
      类型: [], 函数: [], 变量: [],
      依赖表: [],
      子项目: {},
    };
  },
};

const 图例帮助数据 = {
  '约定': '约定类型代表函数/类型对使用者的隐藏要求。普通类型满足约定时通过约定依赖边连接。',
  'class': '具体实现类型——包含数据和方法，是面向对象设计中的核心构建块。',
  'interface': '抽象契约——只定义"必须有什么能力"，不提供实现。其他类型通过继承实现接口。',
  'enum': '枚举类型——一组命名常量。菱形节点，可在拥有关系中被其他节点引用。',
  'func': '自由函数——不绑定到任何类的全局函数，如工厂函数、算法函数、检查函数。',
  'member': '成员函数——绑定到父类型的函数节点。默认隐藏，勾选"成员"后显示。',
  'variable': '变量——不绑定到任何类型的全局变量/自由变量，如配置项、全局状态、常量。紫色边框。',
  'membervar': '成员变量——绑定到父类型的变量节点（字段/属性）。默认隐藏，勾选"成变"后显示。浅紫色边框。',
  'struct': '数据结构——主要用于存储数据字段，以数据为中心的类型。',
  '置信度': '节点名称前缀的彩色圆点表示 AI 对该节点从需求文档中提取的置信度。高=需求直接提取，中=间接推断，低=AI 推测（优先讨论）。',
  '置信度高': '🟢 高置信度——该节点直接从需求文档中提取，明确可靠。',
  '置信度中': '🟡 中置信度——该节点通过间接推断得出，可能需要确认。',
  '置信度低': '🔴 低置信度——该节点为 AI 推测，建议优先讨论确认。',
  '拥有/包含': 'A 持有/包含 B。蓝色实线。类型持有子类型、父类型拥有成员函数/成员变量都是拥有关系。',
  '继承/实现': 'A 实现/继承 B。绿色虚线。class 实现 interface 或子类继承父类时使用。',
  '符合': '设计时约束。B 满足 A 的条件（前提：B 必须先符合某个约定）。橙色点线。',
  '调用': '运行时调用。函数/类型调用另一函数/类型。红色实线。',
  '符合约定': '设计时约束。B 满足 A 的约定要求。紫色短划线。连接普通类型到约定类型。',


};


const 工具提示 = document.getElementById('legend-tooltip');
let 工具提示计时器 = null;

function 显示图例帮助(键, evt) {
  const text = 图例帮助数据[键];
  if (!text) return;
  工具提示.textContent = text;
  const rect = evt.target.getBoundingClientRect();
  const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
  let left = rect.left - containerRect.left - 100;
  let top = rect.top - containerRect.top - 60;
  if (left < 4) left = 4;
  if (top < 4) top = rect.bottom - containerRect.top + 8;
  if (left + 240 > containerRect.width) left = containerRect.width - 244;
  工具提示.style.left = left + 'px';
  工具提示.style.top = top + 'px';
  工具提示.classList.add('show');
  clearTimeout(工具提示计时器);
  工具提示计时器 = setTimeout(() => 工具提示.classList.remove('show'), 3000);
}

// ==================== 依赖加载检测 ====================

if (typeof G6 === 'undefined') {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                font-family:-apple-system,sans-serif;color:#666;text-align:center;
                padding:20px;line-height:1.8">
      <div>
        <h2 style="color:#333">⚠️ 网络依赖加载失败</h2>
        <p>本页面依赖 AntV G6 和 dagre 布局算法，需要从 CDN 加载。</p>
        <p>请确保网络连接正常，能访问 cdn.jsdelivr.net/npm。</p>
        <p style="font-size:13px;color:#999;margin-top:20px">
          离线使用方案：下载 G6 和 dagre UMD 包到本地，替换 &lt;script&gt; 标签的 src。
        </p>
      </div>
    </div>`;
  throw new Error('G6 未加载——停止执行');
}

// ==================== 启动 ====================


// api 别名：工作数据区使用 api.添加节点(...) 而非 window.实现纲要.添加节点(...)
// SKILL.md 与 template.html 中的注释均依赖此声明，缺失会导致 ReferenceError: api is not defined
// 初始渲染
刷新类型面板();
// 记录初始浏览状态（任务 #20）—— 作为撤回/重做历史的起点
setTimeout(() => {
  记录浏览历史(捕获当前状态());
}, 100);

// ==================== 全局 API 错误构造器 ====================
// 所有 API 校验失败时抛出此错误，被 template.html 的 try-catch 捕获
// 错误消息中会提示 AI 重新查看 API 文档
window.实现纲要APIError = function(message, 错误位置) {
  this.name = '实现纲要APIError';
  this.message = '[API参数错误] ' + message + '【请重新查看 API 文档】';
  this.错误位置 = 错误位置 || '';
  this.stack = new Error().stack;
};
window.实现纲要APIError.prototype = Object.create(Error.prototype);

const api = window.实现纲要;


