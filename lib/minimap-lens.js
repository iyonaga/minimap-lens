'use babel';

import { CompositeDisposable } from 'atom';

class MinimapLens {
  config = {
    lensHeight: {
      description: 'The height of lens in pixels.',
      type: 'integer',
      default: 200,
      minimum: 100
    }
  };

  constructor() {
    this.active = false;
    this.listenersMap = new WeakMap();
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
    this.minimap.registerPlugin('lens-mode', this);
  }

  deactivate() {
    this.minimap.unregisterPlugin('lens-mode');
    this.minimap = null;
  }

  activatePlugin() {
    if (this.active) return;

    this.active = true;
    this.minimapsSubscription = this.minimap.observeMinimaps(minimap => {
      const editor = minimap.getTextEditor();
      const minimapElement = atom.views.getView(minimap);

      const onMouseEnter = this.onMouseEnter.bind(this, editor);
      const onMouseMove = this.onMouseMove.bind(this, editor);
      const onMouseLeave = this.onMouseLeave.bind(this, editor);

      const listeners = {
        onMouseEnter,
        onMouseMove,
        onMouseLeave
      };

      minimapElement.addEventListener('mouseenter', onMouseEnter);
      minimapElement.addEventListener('mousemove', onMouseMove);
      minimapElement.addEventListener('mouseleave', onMouseLeave);

      this.listenersMap.set(minimapElement, listeners);
    });
  }

  deactivatePlugin() {
    if (!this.active) return;

    this.active = false;
    this.unbindAllEvents();
    this.minimapsSubscription.dispose();
    this.subscriptions.dispose();
  }

  onMouseEnter(editor, e) {
    this.showLens(editor, e.layerY);
  }

  onMouseMove(editor, e) {
    this.updateLensPosition(editor, e.layerY);
  }

  onMouseLeave(editor) {
    this.destroyLens(editor);
  }

  unbindAllEvents() {
    const editors = atom.workspace.getTextEditors();
    for (let editor of editors) {
      const minimap = this.minimap.minimapForEditor(editor);
      const minimapElement = atom.views.getView(minimap);
      const listeners = this.listenersMap.get(minimapElement);
      minimapElement.removeEventListener('mouseenter', listeners.onMouseEnter);
      minimapElement.removeEventListener('mousemove', listeners.onMouseMove);
      minimapElement.removeEventListener('mouseleave', listeners.onMouseLeave);
    }
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

    if (
      minimapElement.classList.contains('absolute') ||
      (this.minimap.plugins['minimap-autohide'] &&
        this.minimap.plugins['minimap-autohide'].active) ||
      (this.minimap.plugins['minimap-autohider'] &&
        this.minimap.plugins['minimap-autohider'].active)
    ) {
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
    this.setLensPosition(minimap, editor, lens, layerY);
  }

  createLens(minimap, editor, item, itemView) {
    const lensHeight = atom.config.get('minimap-lens.lensHeight');
    const clipInner = document.createElement('div');
    clipInner.classList.add('clip-inner');
    clipInner.style.height = `${lensHeight}px`;
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

  setLensPosition(minimap, editor, lens, layerY) {
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

    const lensTranslateY = layerY - halfLensHeight;
    // @NOTE: Calculate the "actual" editor height, which corresponds to what `minimapHeight` represents
    //        `editor.getHeight()` includes the height of the margin(blank) area in bottom.
    const editorHeight = editor.getLineCount() * editor.getLineHeightInPixels();
    const lensEditorTransformY =
      -1 * (((minimapScrollTop + layerY) / minimapHeight) * editorHeight) +
      halfLensHeight;

    lens.style.transform = `translateY(${lensTranslateY}px)`;
    lensEditor.style.transform = `translateY(${lensEditorTransformY}px)`;
  }

  updateLensPosition(editor, layerY) {
    if (!this.lensMap.has(editor)) return;
    const minimap = this.minimap.minimapForEditor(editor);
    const { lens } = this.lensMap.get(editor);
    this.setLensPosition(minimap, editor, lens, layerY);
  }

  destroyLens(editor) {
    const { lens, item } = this.lensMap.get(editor);
    item.destroy();
    lens.remove();
    this.lensMap.delete(editor);
  }
}

export default new MinimapLens();
