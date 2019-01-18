'use babel';

import { CompositeDisposable } from 'atom';

class MinimapLens {
  constructor() {
    this.active = false;
    this.lensMap = new WeakMap();
  }

  isActive() {
    return this.active;
  }

  activate() {
    this.subscriptions = new CompositeDisposable();
  }

  consumeMinimapServiceV1(minimap1) {
    this.minimap = minimap1;
    this.minimap.registerPlugin('minimap-lens', this);
  }

  deactivate() {
    this.minimap.unregisterPlugin('minimap-lens');
    this.minimap = null;
  }

  activatePlugin() {
    if (this.active) return;

    this.active = true;
    this.minimapsSubscription = this.minimap.observeMinimaps(minimap => {
      const editor = minimap.getTextEditor();
      let minimapElement = atom.views.getView(minimap);

      minimapElement.addEventListener('mouseenter', e => {
        this.showLens(editor, e.layerY);
      });

      minimapElement.addEventListener('mousemove', e => {
        this.updateLensPosition(editor, e.layerY);
      });

      minimapElement.addEventListener('mouseleave', () => {
        this.destroyLens(editor);
      });
    });
  }

  deactivatePlugin() {
    if (!this.active) return;

    this.active = false;
    this.minimapsSubscription.dispose();
    this.subscriptions.dispose();
  }

  showLens(editor, layerY) {
    if (!editor || this.lensMap.has(editor)) return;

    const minimap = this.minimap.minimapForEditor(editor);
    const editorView = atom.views.getView(editor);
    const editorWidth = getComputedStyle(editorView.querySelector('div'), null)
      .width;
    const editorHeight = getComputedStyle(
      editorView.querySelector('.scroll-view > div'),
      null
    ).height;

    const item = editor.copy();
    const itemView = atom.views.getView(item);
    itemView.style.height = editorHeight;
    itemView.style.width = editorWidth;

    // Is this the best way to go?
    const pane = atom.workspace.getPanes()[3];
    pane.addItem(item);
    pane.removeItem(item);

    const lens = this.createLens(minimap, editor, item, itemView);
    this.setLensPosition(minimap, lens, layerY);
  }

  createLens(minimap, editor, item, itemView) {
    const clipInner = document.createElement('div');
    clipInner.classList.add('minimap-lens-clip-inner');
    clipInner.appendChild(itemView);

    const clip = document.createElement('div');
    clip.classList.add('minimap-lens-clip');

    if (atom.views.getView(minimap).classList.contains('left')) {
      clip.classList.add('left');
    }

    clip.appendChild(clipInner);

    const lensContainer = document.createElement('div');
    lensContainer.classList.add('minimap-lens-container');
    lensContainer.appendChild(clip);

    const lens = atom.views.getView(editor).appendChild(lensContainer);
    this.lensMap.set(editor, { lens, item });

    return lens;
  }

  setLensPosition(minimap, lens, layerY) {
    const minimapHeight = minimap.getHeight();
    const minimapScrollTop = minimap.getScrollTop();
    const lensHeight = getComputedStyle(lens, null).height;
    const halfLensHeight = parseInt(lensHeight, 10) / 2;
    const lensEditor = lens.querySelector('atom-text-editor');

    if (minimapScrollTop + layerY > minimapHeight) {
      lens.classList.add('hide');
    } else {
      lens.classList.remove('hide');
    }

    lens.style.transform = `translateY(${layerY - halfLensHeight}px)`;
    lensEditor.style.transform = `translateY(calc(-${((minimapScrollTop +
      layerY) /
      minimapHeight) *
      100}% + ${halfLensHeight}px))`;
  }

  updateLensPosition(editor, layerY) {
    if (!this.lensMap.has(editor)) return;
    const minimap = this.minimap.minimapForEditor(editor);
    const { lens } = this.lensMap.get(editor);
    this.setLensPosition(minimap, lens, layerY);
  }

  destroyLens(editor) {
    const { lens, item } = this.lensMap.get(editor);
    item.destroy();
    lens.remove();
    this.lensMap.delete(editor);
  }
}

export default new MinimapLens();
