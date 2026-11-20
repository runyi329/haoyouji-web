import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch as ActualSwitch } from '../client/src/components/ui/switch';
import { cn } from '../client/src/lib/utils';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Production component AST only, inert primitives and real Radix SSR. No page/router/DB/HTTP imports.
const source = readFileSync(new URL('../client/src/components/ui/switch.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('switch.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Switch') as ts.FunctionDeclaration;
const rootClasses = 'peer data-[state=checked]:bg-[#4CAF50] data-[state=unchecked]:bg-gray-300 focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center justify-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 relative';
const thumbClasses = 'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 absolute left-0';
const trackClasses = 'text-[10px] font-medium text-white z-10 pointer-events-none';

function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function harness() {
  const rootReceived = vi.fn();
  const thumbReceived = vi.fn();
  const Primitive = {
    Root: (props: any) => {
      rootReceived(props);
      const { checked, disabled, onCheckedChange: _onCheckedChange, children, ...domProps } = props;
      const state = checked ? 'checked' : 'unchecked';
      return React.createElement('button', { ...domProps, type: 'button', role: 'switch', disabled, 'aria-checked': Boolean(checked), 'data-state': state },
        React.Children.map(children, child => React.isValidElement<any>(child) && child.type === Primitive.Thumb
          ? React.cloneElement(child, { 'data-state': state }) : child));
    },
    Thumb: (props: any) => { thumbReceived(props); return React.createElement('span', props); },
  };
  const js = ts.transpileModule(`const execute = ${component.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  const execute = new Function('React', 'SwitchPrimitive', 'cn', `${js}; return execute;`)(React, Primitive, cn);
  const tree = (props: any = {}) => execute(props);
  const render = (props: any = {}) => renderToStaticMarkup(tree(props));
  return { tree, render, rootReceived, thumbReceived, Primitive };
}

// Original no-label visual/children contract, without new thumbLabel handling.
function originalTree(Primitive: any, { className, children, ...props }: any) {
  return React.createElement(Primitive.Root, { 'data-slot': 'switch', className: cn(rootClasses, className), ...props },
    React.createElement(Primitive.Thumb, { 'data-slot': 'switch-thumb', className: thumbClasses }),
    children && React.createElement('span', { className: trackClasses }, children));
}

describe('ledger37 AI Switch thumb：真实组件 AST / React / inert primitive 离线回归', () => {
  it('真实类型为可选ReactNode；解构thumbLabel后Root仅spread剩余props', () => {
    expect(component).toBeTruthy();
    const parameter = component.parameters[0];
    expect(ts.isObjectBindingPattern(parameter.name)).toBe(true);
    const binding = parameter.name as ts.ObjectBindingPattern;
    expect(binding.elements.find(item => item.name.getText(ast) === 'thumbLabel')?.dotDotDotToken).toBeUndefined();
    expect(binding.elements.find(item => item.dotDotDotToken)?.name.getText(ast)).toBe('props');
    const fields: ts.PropertySignature[] = [];
    const inspect = (node: ts.Node) => {
      if (ts.isPropertySignature(node) && node.name.getText(ast) === 'thumbLabel') fields.push(node);
      ts.forEachChild(node, inspect);
    };
    inspect(parameter.type!);
    expect(fields).toHaveLength(1); expect(fields[0].questionToken).toBeTruthy();
    expect(fields[0].type?.getText(ast)).toBe('React.ReactNode');
    const roots: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'SwitchPrimitive.Root') roots.push(node);
      ts.forEachChild(node, visit);
    };
    visit(component); expect(roots).toHaveLength(1);
    expect(roots[0].openingElement.attributes.properties.filter(ts.isJsxSpreadAttribute).map(prop => prop.expression.getText(ast))).toEqual(['props']);
    for (const forbidden of ['useMutation', 'mutateAsync', 'fetch(', 'saveLedger37AiDisplay', 'setStock', 'setMutation']) expect(component.getText(ast)).not.toContain(forbidden);
  });
  it('AI只位于Thumb的aria-hidden span中，Root轨道没有AI；实际导入组件同样输出', () => {
    const h = harness();
    for (const tree of [h.tree({ thumbLabel: 'AI' }), ActualSwitch({ thumbLabel: 'AI' })]) {
      const thumb = nodes(tree).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb).toBeTruthy();
      const label = nodes(thumb).find(node => node.type === 'span');
      expect(label.props.children).toBe('AI'); expect(label.props['aria-hidden']).toBe('true');
      for (const token of ['text-[8px]', 'font-bold', 'leading-none', 'text-[#7C3AED]']) expect(label.props.className.split(' ')).toContain(token);
      for (const token of ['flex', 'items-center', 'justify-center']) expect(thumb.props.className.split(' ')).toContain(token);
      const outsideThumb = React.Children.toArray(tree.props.children).filter((child: any) => child.props?.['data-slot'] !== 'switch-thumb');
      expect(text(outsideThumb)).toBe(''); expect(tree.props).not.toHaveProperty('thumbLabel');
      expect(nodes(tree).filter(node => node.type === 'button')).toHaveLength(0);
    }
  });
  it('checked false/true文字始终在滑块中，仿Primitive透传state且保留原transform动画', () => {
    const h = harness();
    for (const checked of [false, true]) {
      const markup = h.render({ checked, thumbLabel: 'AI', 'aria-label': '成员甲的全局AI视角' });
      const root = h.rootReceived.mock.lastCall![0];
      const thumb = h.thumbReceived.mock.lastCall![0];
      expect(root.checked).toBe(checked); expect(thumb['data-state']).toBe(checked ? 'checked' : 'unchecked');
      expect(text(thumb.children)).toBe('AI');
      for (const token of ['transition-transform', 'data-[state=checked]:translate-x-[calc(100%-2px)]', 'data-[state=unchecked]:translate-x-0', 'absolute', 'left-0', 'pointer-events-none', 'size-4', 'rounded-full']) expect(thumb.className.split(' ')).toContain(token);
      expect(markup).toContain(`aria-checked="${checked}"`);
      expect(markup).toContain(`data-state="${checked ? 'checked' : 'unchecked'}"`);
      expect(markup.match(/>AI</g)).toHaveLength(1); expect(markup.match(/<button\b/g)).toHaveLength(1);
      expect(markup).not.toMatch(/thumbLabel=|thumblabel=/);
    }
  });
  it('真实Radix静态渲染在两个状态均保留AI、角色、禁用与可访问名称，无额外button或DOM属性泄漏', () => {
    for (const checked of [false, true]) {
      const markup = renderToStaticMarkup(React.createElement(ActualSwitch, {
        thumbLabel: 'AI', checked, disabled: true, 'aria-label': '成员甲的全局AI视角',
      }));
      expect(markup).toContain('role="switch"'); expect(markup).toContain(`aria-checked="${checked}"`);
      expect(markup).toContain('aria-label="成员甲的全局AI视角"'); expect(markup).toContain('disabled=""');
      expect(markup).toMatch(new RegExp(`data-slot="switch-thumb"[^>]*data-state="${checked ? 'checked' : 'unchecked'}"|data-state="${checked ? 'checked' : 'unchecked'}"[^>]*data-slot="switch-thumb"`));
      expect(markup).toContain('aria-hidden="true"'); expect(markup.match(/>AI</g)).toHaveLength(1);
      expect(markup.match(/<button\b/g)).toHaveLength(1); expect(markup).not.toMatch(/thumbLabel=|thumblabel=/);
    }
  });
  it('有thumbLabel仍完整透传checked/disabled/事件/ref/aria/其他Root属性且不执行任何事件', () => {
    const h = harness(); const ref = React.createRef<HTMLButtonElement>();
    const onCheckedChange = vi.fn(), onClick = vi.fn(), onPointerDown = vi.fn(), onKeyDown = vi.fn();
    const props = { checked: true, disabled: true, thumbLabel: 'AI', ref, onCheckedChange, onClick, onPointerDown, onKeyDown,
      id: 'ai-member-901', name: 'global-ai', value: 'yes', required: true, 'aria-label': '成员甲的全局AI视角', 'aria-busy': true,
      title: '适用于37号账本全部视角', 'data-observer': 'keep', className: 'data-[state=checked]:bg-[#8B5CF6]' };
    h.render(props);
    const root = h.rootReceived.mock.lastCall![0];
    for (const [name, value] of Object.entries(props)) {
      if (name !== 'thumbLabel' && name !== 'className') expect(root[name]).toBe(value);
    }
    expect(root).not.toHaveProperty('thumbLabel'); expect(root.className).toContain('data-[state=checked]:bg-[#8B5CF6]');
    for (const spy of [onCheckedChange, onClick, onPointerDown, onKeyDown]) expect(spy).not.toHaveBeenCalled();
    root.onCheckedChange(false); expect(onCheckedChange).toHaveBeenCalledTimes(1); expect(onCheckedChange).toHaveBeenCalledWith(false);
    const event = { stopPropagation: vi.fn() }; root.onClick(event); expect(onClick).toHaveBeenCalledTimes(1); expect(onClick).toHaveBeenCalledWith(event);
  });
  it('默认无label与原Switch完全相同的样式/轨道children/checked/disabled/事件输出，普通观察开关不变', () => {
    const h = harness(); const onCheckedChange = vi.fn(), onClick = vi.fn();
    for (const checked of [false, true]) for (const disabled of [false, true]) for (const children of [undefined, '观察', React.createElement('strong', null, '轨道'), 0, false]) {
      const props = { checked, disabled, children, onCheckedChange, onClick, id: 'ordinary', name: 'observation',
        'aria-label': '成员甲的普通标签观察', 'data-observation': 'unchanged', className: 'w-10' };
      expect(h.render(props)).toBe(renderToStaticMarkup(originalTree(h.Primitive, props)));
      const tree = h.tree(props); const thumb = nodes(tree).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb.props.className).toBe(thumbClasses); expect(text(thumb.props.children)).toBe('');
      expect(nodes(thumb).filter(node => node.type === 'span')).toHaveLength(0);
      expect(tree.props.onCheckedChange).toBe(onCheckedChange); expect(tree.props.onClick).toBe(onClick);
      expect(tree.props.disabled).toBe(disabled); expect(tree.props.checked).toBe(checked);
    }
    expect(onCheckedChange).not.toHaveBeenCalled(); expect(onClick).not.toHaveBeenCalled();
  });
  it('thumbLabel与原轨道children独立，ReactNode置于Thumb而轨道文字仍在Root原span', () => {
    const h = harness(); const label = React.createElement('strong', { 'data-test-label': 'node' }, 'AI');
    const tree = h.tree({ checked: true, thumbLabel: label, children: '轨道文字' });
    const thumb = nodes(tree).find(node => node.props?.['data-slot'] === 'switch-thumb');
    expect(thumb.props.children.props.children).toBe(label);
    const track = (React.Children.toArray(tree.props.children) as any[]).find(child => child.type === 'span');
    expect(track.props.children).toBe('轨道文字'); expect(track.props.className).toBe(trackClasses);
    expect(text(thumb)).toBe('AI'); expect(text(track)).toBe('轨道文字');
    expect(tree.props).not.toHaveProperty('thumbLabel');
    const markup = h.render({ thumbLabel: label, children: '轨道文字' });
    expect(markup.match(/<button\b/g)).toHaveLength(1); expect(markup).toContain('data-test-label="node"');
  });
  it('省略/undefined/null标签不新增span或改变默认样式，ReactNode 0同样保留在Thumb', () => {
    const h = harness();
    for (const thumbLabel of [undefined, null]) {
      const tree = h.tree({ thumbLabel, children: '观察' });
      const thumb = nodes(tree).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb.props.className).toBe(thumbClasses); expect(nodes(thumb).filter(node => node.type === 'span')).toHaveLength(0);
      expect(tree.props).not.toHaveProperty('thumbLabel');
      expect(h.render({ thumbLabel, children: '观察' })).toBe(renderToStaticMarkup(originalTree(h.Primitive, { children: '观察' })));
    }
    const thumb = nodes(h.tree({ thumbLabel: 0 })).find(node => node.props?.['data-slot'] === 'switch-thumb');
    expect(thumb.props.children.props.children).toBe(0); expect(text(thumb)).toBe('0');
  });
});
