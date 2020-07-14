'use babel';

import { CompositeDisposable } from 'atom';

class MinimapLens {
  config = {
    lensHeight: {
      description: 'The height of lens in pixels.',
      type: 'integer',
      default: 200,
      minimum: 100
    },
    lensDelay: {
      description: 'Delay before showing the lens (in ms)',
      type: 'integer',
      default: 0,
      minimum: 0
    }
  };

  constructor() {
    this.active = false;
    this.listenersMap = new WeakMap();
    this.lensMap = new WeakMap();
    this.timeoutId = null;
  }

  isActive() {
    return this.active;
  }

  activate() {
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.config.observe('minimap-lens.lensDelay', v => {
        this.timeoutDelay = v;
      })
    );
  }

  consumeMinimapServiceV1(minimap1) {
    this.minimap = minimap1;
    this.minimap.registerPlugin('lens-mode', this);
  }

  deactivate() {
    this.destroyLens();
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
      const onMousePressed = this.onMousePressed.bind(this, editor);
      const onMouseReleased = this.onMouseReleased.bind(this, editor);

      const listeners = {
        onMouseEnter,
        onMouseMove,
        onMouseLeave,
        onMousePressed,
        onMouseReleased
      };

      minimapElement.addEventListener('mouseenter', onMouseEnter);
      minimapElement.addEventListener('mousemove', onMouseMove);
      minimapElement.addEventListener('mouseleave', onMouseLeave);
      minimapElement.addEventListener('mousedown', onMousePressed);
      minimapElement.addEventListener('mouseup', onMouseReleased);

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
    if (this.timeoutDelay > 0) {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        this.showLens(editor, e.layerY);
      }, this.timeoutDelay);
    } else {
      this.showLens(editor, e.layerY);
    }
  }

  onMouseMove(editor, e) {
    this.updateLensPosition(editor, e.layerY);
  }

  onMouseLeave(editor) {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    } else {
      this.hideLens();
    }
  }

  onMousePressed(editor, e) {
    // if mouse is pressed hide the lens
    if (typeof e === 'object' && e.button == 0) {
      this.hideLens();
    }
  }

  onMouseReleased(editor, e) {
    // when mouse is released show the lens
    if (typeof e === 'object' && e.button == 0) {
      this.showLens(editor, e.layerY);
    }
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
      minimapElement.removeEventListener('mousedown', listeners.onMousePressed);
      minimapElement.removeEventListener('mouseup', listeners.onMouseReleased);
    }
  }

  showLens(editor, layerY) {
    if (!editor || this.lensMap.has(editor)) return;
    const item = editor.copy();
    const minimap = this.minimap.minimapForEditor(editor);

    if (!this.lensView || this.editor != editor) {
      const itemView = this.prepareCreateLens(minimap, editor, item);
      this.editor = editor; // used to check if editor is new
      this.lensView = this.createLens(minimap, editor, itemView); // create lens
      if (!this.lensView) {
        return;
      }
    } else {
      this.lensView.style.display = ''; // show
    }
    this.lensMap.set(editor, { lens: this.lensView, item });

    this.setLensPosition(minimap, editor, this.lensView, layerY);
  }

  // calculations needed for createLens
  prepareCreateLens(minimap, editor, item) {
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

    const itemView = atom.views.getView(item);
    if (!itemView) {
      return null;
    }
    itemView.style.height = `${editorHeight}px`;
    itemView.style.width = `${editorWidth}px`;

    // Is this the best way to go?
    const pane = atom.workspace.getPanes()[3];
    pane.addItem(item);
    pane.removeItem(item);

    return itemView;
  }

  createLens(minimap, editor, itemView) {
    if (!itemView) {
      return null;
    }
    this.destroyLens(); // clean last lens memory
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
    this.setLensPosition(minimap, editor, this.lensView, layerY);
  }

  hideLens() {
    if (!this.lensView) {
      return;
    }
    this.lensView.style.display = 'none'; // hide
    this.lensMap.delete(this.previousEditor);
  }

  destroyLens() {
    // clear previous lens memory
    if (this.previousEditor && this.lensMap.has(this.previousEditor)) {
      const { previousLens, previousItem } = this.lensMap.get(
        this.previousEditor
      );
      if (previousItem) {
        previousItem.destroy();
      }
      if (previousLens) {
        previousLens.remove();
      }
      this.lensMap.delete(this.previousEditor);
    }
    this.previousEditor = this.editor; // update previousEditor
  }
}

export default new MinimapLens();
