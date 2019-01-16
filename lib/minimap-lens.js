'use babel';

import { CompositeDisposable } from 'atom';

class MinimapLens {
  constructor() {
    this.active = false;
  }

  isActive() { return this.active; }

  activate(state) {
    this.subscriptions = new CompositeDisposable;
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
    this.minimapsSubscription = this.minimap.observeMinimaps((minimap) => {
      let minimapElement = atom.views.getView(minimap);
    });
  }

  deactivatePlugin() {
    if (!this.active) return;

    this.active = false;
    this.minimapsSubscription.dispose();
    this.subscriptions.dispose();
  }
}

export default new MinimapLens();
