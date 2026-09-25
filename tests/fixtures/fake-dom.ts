/* ============================================================
  一个够用的假 DOM
  ------------------------------------------------------------
  仓库里没有 jsdom（装不了），而"徽标 ↔ 文本"这类换算必须真的跑一遍
  才算验过。所以这里手写一层最小的实现：只做那几个函数用到的几件事——
  createElement / createTextNode、childNodes、textContent、dataset、
  querySelectorAll（只认 `[data-xxx]` 与 `[data-xxx="值"]` 两种写法）。

  最容易写错、也最要命的一条：**一个节点挂到新父节点上时要从旧父节点摘掉**
  （真 DOM 就是这么干的）。少了这一步，`normalizeEditorDOM` 那种
  "把子节点搬到父节点前面"的循环会永远搬不完——测试自己先转进死循环。
  ============================================================ */

export class FakeNode {
  nodeType: number;
  textContent: string | null = null;
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  ownerDocument: FakeDocument;

  constructor(nodeType: number, ownerDocument: FakeDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastElementChild(): FakeNode | null {
    for (let index = this.childNodes.length - 1; index >= 0; index -= 1) {
      const node = this.childNodes[index];
      if (node !== undefined && node.nodeType === 1) return node;
    }
    return null;
  }

  get previousSibling(): FakeNode | null {
    if (this.parentNode === null) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index <= 0 ? null : this.parentNode.childNodes[index - 1] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (this.parentNode === null) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  appendChild(node: FakeNode): FakeNode {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node: FakeNode, reference: FakeNode | null): FakeNode {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    const index = reference === null ? -1 : this.childNodes.indexOf(reference);
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild(node: FakeNode): FakeNode {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  contains(node: FakeNode | null): boolean {
    if (node === null) return false;
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains(node));
  }
}

export class FakeText extends FakeNode {
  constructor(text: string, ownerDocument: FakeDocument) {
    super(3, ownerDocument);
    this.textContent = text;
  }
}

/**
 * `data-mention-suggest` → `mentionSuggest`。
 *
 * 选择器里写的是 kebab 的属性名，而 `dataset` 的键是 camelCase——
 * 少了这一步换算，`querySelectorAll('[data-mention-suggest]')` 会**一个都找不到**，
 * 而失败的样子是"删不掉东西"，看起来像产品代码坏了。
 */
function datasetKeyOf(attributeName: string): string {
  return attributeName
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

export class FakeElement extends FakeNode {
  tagName: string;
  className = '';
  contentEditable = '';
  draggable = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  closest(selector: string): FakeElement | null {
    const wanted = selector.replace(/[[\]]/g, '');
    const [attribute, quoted] = wanted.split('=');
    const name = attribute === undefined ? undefined : datasetKeyOf(attribute);
    const expected = quoted?.replace(/^"|"$/g, '');
    let node: FakeNode | null = this;
    while (node !== null) {
      if (node instanceof FakeElement && name !== undefined && node.dataset[name] !== undefined) {
        if (expected === undefined || node.dataset[name] === expected) return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  /** 只认 `[data-xxx]` 与 `[data-xxx="值"]`；别的一律返回空数组（不假装支持选择器） */
  querySelectorAll(selector: string): FakeElement[] {
    const wanted = selector.replace(/[[\]]/g, '');
    const [attribute, quoted] = wanted.split('=');
    const name = attribute === undefined ? undefined : datasetKeyOf(attribute);
    const expected = quoted?.replace(/^"|"$/g, '');
    const out: FakeElement[] = [];
    const walk = (node: FakeNode): void => {
      if (node instanceof FakeElement && name !== undefined && node.dataset[name] !== undefined) {
        if (expected === undefined || node.dataset[name] === expected) out.push(node);
      }
      for (const child of node.childNodes) walk(child);
    };
    for (const child of this.childNodes) walk(child);
    return out;
  }
}

export class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createTextNode(text: string): FakeText {
    return new FakeText(text, this);
  }
}

/** 装一套全新的假 DOM 到全局，返回根元素。每次用例都该调一次。 */
export function installFakeDom(): { root: FakeElement; document: FakeDocument } {
  const document_ = new FakeDocument();
  const root = document_.createElement('div');
  (globalThis as unknown as { document: FakeDocument }).document = document_;
  (globalThis as unknown as { HTMLElement: typeof FakeElement }).HTMLElement = FakeElement;
  return { root, document: document_ };
}
