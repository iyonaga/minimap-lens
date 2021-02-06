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
      description:
        'Delay before showing the lens (in ms). Setting this number lower than the default causes performance issues.',
      type: 'integer',
      default: 300,
      minimum: 0
    },
    largeFileLinesNum: {
      description:
        'When the number of lines of an editor is larger than this number, the minimap lens is disabled to prevent slowing down of the editor.',
      type: 'integer',
      default: 1500,
      minimum: 1
    }
  };

  constructor() {
    this.active = false;
    this.listenersMap = new WeakMap();
    this.lensMap = new WeakMap(); // a map from editor to {lens, item, editorDims, minimapDims}
    this.thrownLargeFileWarning = new WeakMap(); // a map from editor to boolean
    this.timeoutId = null;
  }

  isActive() {
    return this.active;
  }

  activate() {
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.config.observe('minimap-lens.lensHeight', h => {
        this.lensHeight = h;
      }),
      atom.config.observe('minimap-lens.lensDelay', v => {
        this.timeoutDelay = v;
      })
    );
    this.editorObserver();
  }

  // removes the lens when editor is destroyed
  editorObserver() {
    const activeTextEditorObserver = atom.workspace.observeActiveTextEditor(
      editor => {
        if (editor) {
          editor.onDidDestroy(() => this.destroyLens(editor));
        }
      }
    );
    this.subscriptions.add(activeTextEditorObserver);
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

      minimapElement.addEventListener('mouseenter', onMouseEnter, {
        passive: true
      });
      minimapElement.addEventListener('mousemove', onMouseMove, {
        passive: true
      });
      minimapElement.addEventListener('mouseleave', onMouseLeave, {
        passive: true
      });
      minimapElement.addEventListener('mousedown', onMousePressed, {
        passive: true
      });
      minimapElement.addEventListener('mouseup', onMouseReleased, {
        passive: true
      });

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
    if (this.isInLargeFileMode(editor)) {
      return;
    }
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
    if (this.isInLargeFileMode(editor)) {
      return;
    }
    this.updateLensPosition(editor, e.layerY);
  }

  onMouseLeave(editor, e) {
    if (this.isInLargeFileMode(editor)) {
      return;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    } else {
      this.hideLens();
    }
  }

  onMousePressed(editor, e) {
    if (this.isInLargeFileMode(editor)) {
      return;
    }
    // if mouse is pressed hide the lens
    if (typeof e === 'object' && e.button == 0) {
      this.hideLens();
    }
  }

  onMouseReleased(editor, e) {
    if (this.isInLargeFileMode(editor)) {
      return;
    }
    // when mouse is released show the lens
    if (typeof e === 'object' && e.button == 0) {
      this.showLens(editor, e.layerY);
    }
  }

  isInLargeFileMode(editor) {
    if (
      editor.largeFileMode ||
      editor.getLineCount() >= atom.config.get('minimap-lens.largeFileLinesNum')
    ) {
      if (!this.thrownLargeFileWarning.get(editor)) {
        this.thrownLargeFileWarning.set(editor, true);
        atom.notifications.addWarning(
          'Minimap Lens is disabled in large files to prevent slowing down the editor.'
        );
      }
      return true;
    } else {
      this.thrownLargeFileWarning.set(editor, false);
      return false;
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
    if (!editor) return;

    const minimap = this.minimap.minimapForEditor(editor);
    const [editorWidth, editorHeight] = this.calcEditorDims(minimap, editor);

    // check if should create lens
    const editorHasLens = this.lensMap.has(editor);
    const shouldCreateLens =
      !this.lensView || // no lens so far
      !editorHasLens || // editor does not have lens
      (editorHasLens &&
        this.lensMap.get(editor).editorDims.editorWidth !== editorWidth); // editor width has changed

    if (shouldCreateLens) {
      this.anitmationRequest = requestAnimationFrame(() => {
        // create lens from scratch
        const item = editor.copy(); // do not modify the original editor
        const itemView = this.prepareCreateLens(
          item,
          editorHeight,
          editorWidth
        );
        this.lensView = this.createLens(minimap, editor, itemView); // create lens
        if (!this.lensView) {
          return;
        }

        // calc minimap dims
        const minimapDims = this.calcMinimapDims(minimap);

        // add editor and related values to the cache
        this.lensMap.set(editor, {
          lens: this.lensView,
          item,
          editorDims: {
            editorWidth,
            editorHeight
          },
          minimapDims
        });

        this.setLensPosition(minimap, editor, this.lensView, layerY);
      });
    } else {
      // show lens from cache
      // get the lensView from cache
      const lensMap = this.lensMap.get(editor);
      this.lensView = lensMap.lens;
      // show lens
      this.lensView.style.display = '';

      // check if editor height has changed compared to cache
      const editorHeightHasChanged =
        this.lensMap.get(editor).editorDims.editorHeight !== editorHeight;
      // update minimapDims if editor height has changed
      if (editorHeightHasChanged) {
        const minimapDims = this.calcMinimapDims(minimap);
        this.lensMap.get(editor).minimapDims = minimapDims;
      }
      this.setLensPosition(minimap, editor, this.lensView, layerY);
    }
  }

  // editor dimensions calculations needed for createLens
  calcEditorDims(minimap, editor) {
    // TODO perform these calculations inside minimap-plus instead
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

    const pluginsOrder = this.minimap.getPluginsOrder();

    if (
      minimapElement.classList.contains('absolute') ||
      'minimap-autohide' in pluginsOrder ||
      'minimap-autohider' in pluginsOrder
    ) {
      editorWidth = editorWidth - minimapElement.clientWidth;
    }

    return [editorWidth, editorHeight];
  }

  prepareCreateLens(item, editorHeight, editorWidth) {
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
    const clipInner = document.createElement('div');
    clipInner.classList.add('clip-inner');
    clipInner.style.height = `${this.lensHeight}px`;
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

  // minimap dimensions needed for setting location of lens
  calcMinimapDims(minimap) {
    const minimapHeight = minimap.getHeight();
    const minimapVisibleAreaHeight = Math.round(
      minimap.getTextEditorScaledHeight()
    );
    return {
      minimapHeight,
      minimapVisibleAreaHeight
    };
  }

  setLensPosition(minimap, editor, lens, layerY) {
    this.cancelAnimation();

    // get minimapDims from cache
    const { minimapHeight, minimapVisibleAreaHeight } = this.lensMap.get(
      editor
    ).minimapDims;

    const minimapScrollTop = minimap.getScrollTop();
    const minimapVisibleAreaTop =
      minimap.getTextEditorScaledScrollTop() - minimapScrollTop;

    if (
      minimapHeight < minimapScrollTop + layerY ||
      (minimapVisibleAreaTop <= layerY &&
        layerY <= minimapVisibleAreaTop + minimapVisibleAreaHeight)
    ) {
      lens.classList.add('is-hide');
    } else {
      lens.classList.remove('is-hide');
    }

    const halfLensHeight = this.lensHeight / 2;
    const lensTranslateY = layerY - halfLensHeight;
    // @NOTE: Calculate the "actual" editor height, which corresponds to what `minimapHeight` represents
    //        `editor.getHeight()` includes the height of the margin(blank) area in bottom.
    const editorHeight = editor.getLineCount() * editor.getLineHeightInPixels();
    const lensEditorTransformY =
      -1 * (((minimapScrollTop + layerY) / minimapHeight) * editorHeight) +
      halfLensHeight;

    lens.style.transform = `translateY(${lensTranslateY}px)`;

    const lensEditor = lens.querySelector('atom-text-editor');
    lensEditor.style.transform = `translateY(${lensEditorTransformY}px)`;
  }

  updateLensPosition(editor, layerY) {
    if (!this.lensMap.has(editor)) return;
    const minimap = this.minimap.minimapForEditor(editor);
    this.setLensPosition(minimap, editor, this.lensView, layerY);
  }

  // hides the lense when mouse leaves the minimap
  hideLens() {
    if (!this.lensView) {
      return;
    }
    this.cancelAnimation();
    this.lensView.style.display = 'none'; // hide
  }

  cancelAnimation() {
    if (this.anitmationRequest) {
      cancelAnimationFrame(this.anitmationRequest);
      this.anitmationRequest = null;
    }
  }

  // clears the lens memory of the given editor if it had lens
  destroyLens(editor) {
    this.cancelAnimation();
    if (this.lensMap.has(editor)) {
      const { lens, item } = this.lensMap.get(editor);
      if (item) {
        item.destroy();
      }
      if (lens) {
        lens.remove();
      }
      this.lensMap.delete(editor);
      this.thrownLargeFileWarning.delete(editor);
    }
  }
}

export default new MinimapLens();
