// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Accessibility.AXTreePane = class extends Accessibility.AccessibilitySubPane {
  /**
   * @param {!Accessibility.AccessibilitySidebarView} axSidebarView
   */
  constructor(axSidebarView) {
    super(Common.UIString('Accessibility Tree'));

    this._axSidebarView = axSidebarView;
    this._treeOutline = new Accessibility.AXTreeOutline(this);
    this._treeOutline.setPaddingSize(12);
    this.element.appendChild(this._treeOutline.element);

    this.element.classList.add('accessibility-computed');
  }

  /**
   * @param {?Accessibility.AccessibilityNode} axNode
   * @override
   */
  setAXNode(axNode) {
    this._axNode = axNode;

    var treeOutline = this._treeOutline;
    treeOutline.removeChildren();

    // TODO(aboxhall): show no node UI
    if (!axNode)
      return;

    var previousTreeElement = treeOutline.rootElement();
    var inspectedNodeTreeElement = new Accessibility.AXNodeTreeElement(axNode);
    inspectedNodeTreeElement.setInspected(true);

    var parent = axNode.parentNode();
    if (parent) {
      var ancestorChain = [];
      var ancestor = parent;
      while (ancestor) {
        ancestorChain.unshift(ancestor);
        ancestor = ancestor.parentNode();
      }
      for (var ancestorNode of ancestorChain) {
        var ancestorTreeElement = new Accessibility.AXNodeTreeElement(ancestorNode);
        previousTreeElement.appendChild(ancestorTreeElement);
        previousTreeElement.expand();
        previousTreeElement = ancestorTreeElement;
      }
    }

    previousTreeElement.appendChild(inspectedNodeTreeElement);
    previousTreeElement.expand();

    inspectedNodeTreeElement.selectable = true;
    inspectedNodeTreeElement.select(!this._selectedByUser /* omitFocus */, false);
    inspectedNodeTreeElement.expand();
    this.clearSelectedByUser();
  }

  /**
   * @param {!Accessibility.AccessibilityNode} axNode
   */
  setInspectedNode(axNode) {
    if (axNode.parentNode()) {
      Common.Revealer.reveal(axNode.deferredDOMNode());
    } else {
      // Only set the node for the accessibility panel, not the Elements tree.
      var axSidebarView = this._axSidebarView;
      axNode.deferredDOMNode().resolve((node) => {
        axSidebarView.setNode(node);
      });
    }
  }

  /**
   * @param {boolean} selectedByUser
   */
  setSelectedByUser(selectedByUser) {
    this._selectedByUser = true;
  }

  clearSelectedByUser() {
    delete this._selectedByUser;
  }

  /**
   * @return {!SDK.Target}
   */
  target() {
    return this.node().target();
  }
};

Accessibility.InspectNodeButton = class {
  /**
   * @param {!Accessibility.AccessibilityNode} axNode
   * @param {!Accessibility.AXTreePane} treePane
   */
  constructor(axNode, treePane) {
    this._axNode = axNode;
    this._treePane = treePane;

    this.element = UI.Icon.create('smallicon-arrow-in-circle', 'inspect-dom-node');
    this.element.addEventListener('mousedown', this._handleMouseDown.bind(this));
  }

  /**
   * @param {!Accessibility.AXNodeTreeElement} axNodeTreeElement
   */
  setPosition(axNodeTreeElement) {
    var treeElement = axNodeTreeElement.parent;
    var depth = 0;
    while (treeElement !== null) {
      depth++;
      if (depth > 1)
        return;
      treeElement = treeElement.parent;
    }
    this.element.style.position = 'static';
  }

  /**
   * @param {!Event} event
   */
  _handleMouseDown(event) {
    if (event.button != 0)
      return;
    this._treePane.setSelectedByUser(true);
    this._treePane.setInspectedNode(this._axNode);
  }
};

Accessibility.AXTreeOutline = class extends UI.TreeOutlineInShadow {
  /**
   * @param {!Accessibility.AXTreePane} treePane
   */
  constructor(treePane) {
    super();

    /** @type {!Accessibility.AXTreePane} */
    this._treePane = treePane;

    this.registerRequiredCSS('accessibility/accessibilityNode.css');
    this.registerRequiredCSS('components/objectValue.css');

    this.element.addEventListener('mouseleave', this._onmouseleave.bind(this), false);
  }

  /**
   * @return {boolean}
   * @override
   */
  selectPrevious() {
    var startElement = this._hoveredTreeElement || this.selectedTreeElement;
    var nextSelectedElement = startElement.traversePreviousTreeElement(true);
    while (nextSelectedElement && !nextSelectedElement.selectable)
      nextSelectedElement = nextSelectedElement.traversePreviousTreeElement(!this.expandTreeElementsWhenArrowing);
    if (nextSelectedElement) {
      nextSelectedElement.reveal();
      nextSelectedElement.select();
      return true;
    }
    return false;
  }

  /**
   * @return {boolean}
   * @override
   */
  selectNext() {
    var startElement = this._hoveredTreeElement || this.selectedTreeElement;
    var nextSelectedElement = startElement.traverseNextTreeElement(true);
    while (nextSelectedElement && !nextSelectedElement.selectable)
      nextSelectedElement = nextSelectedElement.traverseNextTreeElement(!this.expandTreeElementsWhenArrowing);
    if (nextSelectedElement) {
      nextSelectedElement.reveal();
      nextSelectedElement.select();
      return true;
    }
    return false;
  }

  setHoveredTreeElement(treeElement) {
    if (this._hovered === treeElement)
      return;
    if (this._hovered)
      this._hovered.setHovered(false);
    this._hovered = treeElement;
  }

  _onmouseleave(event) {
    this.setHoveredTreeElement(null);
  }

};

/**
 * @unrestricted
 */
Accessibility.AXNodeTreeElement = class extends UI.TreeElement {
  /**
   * @param {!Accessibility.AccessibilityNode} axNode
   */
  constructor(axNode) {
    // Pass an empty title, the title gets made later in onattach.
    super('');

    /** @type {!Accessibility.AccessibilityNode} */
    this._axNode = axNode;

    this.selectable = true;
    this._hovered = false;

    this.listItemElement.addEventListener('mousemove', this._onmousemove.bind(this), false);
    this.listItemElement.addEventListener('mouseleave', this._onmouseleave.bind(this), false);
    this.listItemElement.classList.toggle('dom-node', axNode.isDOMNode());
  }

  /**
   * @param {boolean} x
   */
  setHovered(x) {
    if (!this.treeOutline || this._hovered === x)
      return;
    this._hovered = x;

    this.listItemElement.classList.toggle('hovered', x);
    if (this._hovered) {
      this.highlightDOMNode();
      this.treeOutline.setHoveredTreeElement(this);
    }
  }

  highlightDOMNode() {
    if (this._axNode.isDOMNode())
      this._axNode.highlightDOMNode();
  }

  computeLeftPadding() {
    var treeElement = this.parent;
    var depth = 0;
    while (treeElement !== null) {
      depth++;
      treeElement = treeElement.parent;
    }
    return this.treeOutline._paddingSize * (depth - 1) + 6;
  }

  /**
   * @override
   */
  onbind() {
    this._inspectNodeButton = new Accessibility.InspectNodeButton(this._axNode, this.treeOutline._treePane);


    this.listItemElement.style.paddingLeft =  this.computeLeftPadding() + "px";
  }

  _onmousemove(event) {
    this.setHovered(true);
  }

  _onmouseleave(event) {
    this.setHovered(false);
    event.consume();
  }

  /**
   * @override
   */
  onunbind() {
    this.setHovered(false);
  }

  /**
   * @return {!Accessibility.AccessibilityNode}
   */
  axNode() {
    return this._axNode;
  }

  /**
   * @param {boolean} inspected
   */
  setInspected(inspected) {
    this._inspected = inspected;

    this.listItemElement.classList.toggle('inspected', this._inspected);
    this.listItemElement.classList.toggle('selected', this._inspected);
    this.listItemElement.classList.toggle('force-white-icons', this._inspected);
  }

  /**
   * @override
   * @param {Event} event
   */
  selectOnMouseDown(event) {
    this.inspectDOMNode();
    event.consume(true);
  }

  /**
   * @override
   * @return {boolean}
   */
  onenter() {
    this.inspectDOMNode();
    return true;
  }

  /**
   * @param {boolean=} selectedByUser
   * @return {boolean}
   */
  onselect(selectedByUser) {
    this.inspectDOMNode();
    return false;
  }

  /**
   * @override
   */
  onpopulate() {
    for (var child of this._axNode.children()) {
      var childTreeElement = new Accessibility.AXNodeTreeElement(child);
      this.appendChild(childTreeElement);
      if (childTreeElement.isExpandable() && !child.hasOnlyUnloadedChildren())
        childTreeElement.expand();
    }
  }

  /**
   * @override
   */
  expand() {
    if (this.axNode().hasOnlyUnloadedChildren())
      return;
    super.expand();
  }


  inspectDOMNode() {
    if (!this.treeOutline || !this._axNode.isDOMNode())
      return;
    this.treeOutline._treePane.setSelectedByUser(true);
    this.treeOutline._treePane.setInspectedNode(this._axNode);
  }

  /**
   * @override
   */
  onattach() {
    this._update();
  }

  _update() {
    this.titleElement().removeChildren();

    if (this._axNode.ignored()) {
      this._appendIgnoredNodeElement();
    } else {
      this._appendRoleElement(this._axNode.role());
      if (this._axNode.name() && this._axNode.name().value) {
        this.titleElement().createChild('span', 'separator').textContent = '\u00A0';
        this._appendNameElement(/** @type {string} */ (this._axNode.name().value));
      }
    }

    if (this._axNode.hasOnlyUnloadedChildren()) {
      this.listItemElement.classList.add('children-unloaded');
      this.setExpandable(true);
    } else {
      this.setExpandable(!!this._axNode.numChildren());
    }

    if (!this._axNode.isDOMNode())
      this.listItemElement.classList.add('no-dom-node');
    this.titleElement().appendChild(this._inspectNodeButton.element);
    this._inspectNodeButton.setPosition(this);
  }

  /**
   * @override
   */
  collapse() {
    if (!this.treeOutline || !this._axNode || this._axNode.hasOnlyUnloadedChildren())
      return;

    super.collapse();
  }

  /**
   * @param {string} name
   */
  _appendNameElement(name) {
    var nameElement = createElement('span');
    nameElement.textContent = '"' + name + '"';
    nameElement.classList.add('ax-readable-string');
    this.titleElement().appendChild(nameElement);
  }

  /**
   * @param {?Protocol.Accessibility.AXValue} role
   */
  _appendRoleElement(role) {
    if (!role)
      return;

    var roleElement = createElementWithClass('span', 'monospace');
    roleElement.classList.add(Accessibility.AXNodeTreeElement.RoleStyles[role.type]);
    roleElement.setTextContentTruncatedIfNeeded(role.value || '');

    this.titleElement().appendChild(roleElement);
  }

  _appendIgnoredNodeElement() {
    var ignoredNodeElement = createElementWithClass('span', 'monospace');
    ignoredNodeElement.textContent = Common.UIString('Ignored');
    ignoredNodeElement.classList.add('ax-tree-ignored-node');
    this.titleElement().appendChild(ignoredNodeElement);
  }

  deselect() {
    if (!this.treeOutline || this.treeOutline.selectedTreeElement !== this || !this.selected)
      return;

    this.selected = false;
    this.treeOutline.selectedTreeElement = null;
    this._listItemNode.classList.remove('preselected');
    this._setFocused(false);
  }

  /**
   * @param {boolean=} omitFocus
   * @param {boolean=} selectedByUser
   * @return {boolean}
   * @override
   */
  select(omitFocus, selectedByUser) {
    if (!this.treeOutline || !this.selectable || this.preselected)
      return false;

    if (this.treeOutline.selectedTreeElement)
      this.treeOutline.selectedTreeElement.deselect();
    this.treeOutline.selectedTreeElement = null;

    if (this.treeOutline._rootElement === this)
      return false;

    this.selected = true;

    if (!omitFocus)
      this.treeOutline.focus();

    // Focusing on another node may detach "this" from tree.
    if (!this.treeOutline)
      return false;
    this.treeOutline.setHoveredTreeElement(null);
    this.treeOutline.selectedTreeElement = this;
    this._listItemNode.classList.add('preselected');
    this._setFocused(this.treeOutline._focused);
    return false;
  }
};

/** @type {!Object<string, string>} */
Accessibility.AXNodeTreeElement.RoleStyles = {
  internalRole: 'ax-internal-role',
  role: 'ax-role',
};

