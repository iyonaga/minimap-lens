'use babel';

describe('MinimapLens', () => {
  let workspaceElement, editor, editorElement, minimap, minimapElement;

  beforeEach(() => {
    workspaceElement = atom.views.getView(atom.workspace);

    waitsForPromise(() =>
      atom.workspace.open('sample.js').then(e => {
        editor = e;
      })
    );

    waitsForPromise(() =>
      atom.packages.activatePackage('minimap').then(pkg => {
        minimap = pkg.mainModule.minimapForEditor(editor);
        minimapElement = atom.views.getView(minimap);
      })
    );

    waitsForPromise(() => atom.packages.activatePackage('minimap-lens'));

    runs(() => {
      editorElement = atom.views.getView(editor);
      jasmine.attachToDOM(workspaceElement);
    });
  });

  describe('with an open editor that have a minimap', () => {
    describe('when hovering to minimap', () => {
      it('code lens should exist', () => {
        const evt = document.createEvent('HTMLEvents');
        evt.initEvent('mouseenter', true, true);
        minimapElement.dispatchEvent(evt);

        expect(
          editorElement.querySelector('.minimap-lens-container')
        ).toExist();
      });
    });
  });
});
