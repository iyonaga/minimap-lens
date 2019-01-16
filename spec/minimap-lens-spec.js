'use babel';

import MinimapLens from '../lib/minimap-lens';

describe("MinimapLens", function() {
  var editor,
      ref,
      workspaceElement;

  beforeEach(function() {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    waitsForPromise(function() { return atom.workspace.open('sample.js'); });

    runs(function() {
      editor = atom.workspace.getActiveTextEditor();
      editor.setText("This is the file content");
    });
    waitsForPromise(function() {
      return atom.packages.activatePackage('minimap');
    });
    return waitsForPromise(function() {
      return atom.packages.activatePackage('minimap-lens');
    });
  });
  describe("with an open editor that have a minimap", function() {
    it("lives", function() {
      expect('life').toBe('easy');
    });
  });
});
