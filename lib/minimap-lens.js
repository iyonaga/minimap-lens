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
    const minimapElement = atom.views.getView(minimap);
    const editorView = atom.views.getView(editor);
    const editorHeight = parseInt(
      getComputedStyle(editorView.querySelector('.scroll-view > div'), null)
        .height,
      10
    );
    let editorWidth = parseInt(
      getComputedStyle(editorView.querySelector('div'), null).width,
      10
    );

    if (minimapElement.classList.contains('absolute')) {
      editorWidth = editorWidth - minimapElement.clientWidth;
    }

    const item = editor.copy();
    const itemView = atom.views.getView(item);
    itemView.style.height = `${editorHeight}px`;
    itemView.style.width = `${editorWidth}px`;

    // Is this the best way to go?
    const pane = atom.workspace.getPanes()[3];
    pane.addItem(item);
    pane.removeItem(item);

    const lens = this.createLens(minimap, editor, item, itemView);
    this.setLensPosition(minimap, lens, layerY);
  }

  createLens(minimap, editor, item, itemView) {
    const clipInner = document.createElement('div');
    clipInner.classList.add('clip-inner');
    clipInner.appendChild(itemView);

    const clip = document.createElement('div');
    clip.classList.add('clip');
    clip.appendChild(clipInner);

    const lensContainer = document.createElement('div');
    lensContainer.classList.add('minimap-lens-container');
    lensContainer.appendChild(clip);

    if (atom.views.getView(minimap).classList.contains('left')) {
      lensContainer.classList.add('left');
    }

    const lens = atom.views.getView(editor).appendChild(lensContainer);
    this.lensMap.set(editor, { lens, item });

    return lens;
  }

  setLensPosition(minimap, lens, layerY) {
    const minimapHeight = minimap.getHeight();
    const minimapScrollTop = minimap.getScrollTop();
    const minimapVisibleAreaTop =
      minimap.getTextEditorScaledScrollTop() - minimapScrollTop;
    const minimapVisibleArea = atom.views
      .getView(minimap)
      .querySelector('.minimap-visible-area');
    const lensHeight = getComputedStyle(lens, null).height;
    const halfLensHeight = parseInt(lensHeight, 10) / 2;
    const lensEditor = lens.querySelector('atom-text-editor');

    if (
      minimapHeight < minimapScrollTop + layerY ||
      (minimapVisibleAreaTop <= layerY &&
        layerY <= minimapVisibleAreaTop + minimapVisibleArea.clientHeight)
    ) {
      lens.classList.add('is-hide');
    } else {
      lens.classList.remove('is-hide');
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