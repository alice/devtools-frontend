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

    this._expandedNodes = new Set();
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
    var inspectedNodeTreeElement = new Accessibility.AXNodeTreeElement(axNode, treeOutline);
    inspectedNodeTreeElement.setInspected(true);

    var parent = axNode.parentNode();
    if (parent) {
      this.setExpanded(parent.backendDOMNodeId(), false);

      var chain = [];
      var ancestor = parent.parentNode();
      while (ancestor) {
        chain.unshift(ancestor);
        ancestor = ancestor.parentNode();
      }
      for (var ancestorNode of chain) {
        var ancestorTreeElement = new Accessibility.AXNodeTreeElement(ancestorNode, treeOutline);
        previousTreeElement.appendChild(ancestorTreeElement);
        previousTreeElement.expand();
        previousTreeElement = ancestorTreeElement;
      }
      var parentTreeElement = new Accessibility.AXNodeTreeElement(parent, inspectedNodeTreeElement, treeOutline);
      previousTreeElement.appendChild(parentTreeElement);
      for (var sibling of parent.children()) {
        if (sibling === axNode)
          parentTreeElement.appendChild(inspectedNodeTreeElement);
        else
          parentTreeElement.appendChild(new Accessibility.AXNodeTreeElement(sibling, treeOutline));
      }
      previousTreeElement.expand();
      previousTreeElement = parentTreeElement;
    } else {
      previousTreeElement.appendChild(inspectedNodeTreeElement);
    }

    previousTreeElement.expand();

    for (var child of axNode.children()) {
      var childTreeElement = new Accessibility.AXNodeTreeElement(child, treeOutline);
      inspectedNodeTreeElement.appendChild(childTreeElement);
    }

    inspectedNodeTreeElement.selectable = true;
    inspectedNodeTreeElement.select(!this._selectedByUser /* omitFocus */, false);
    if (this.isExpanded(axNode.backendDOMNodeId()))
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

  /**
   * @param {?number} backendDOMNodeId
   * @param {boolean} expanded
   */
  setExpanded(backendDOMNodeId, expanded) {
    if (!backendDOMNodeId)
      return;
    if (expanded)
      this._expandedNodes.add(backendDOMNodeId);
    else
      this._expandedNodes.delete(backendDOMNodeId);
  }

  /**
   * @param {?number} backendDOMNodeId
   * @return {boolean}
   */
  isExpanded(backendDOMNodeId) {
    if (!backendDOMNodeId)
      return false;

    return this._expandedNodes.has(backendDOMNodeId);
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
   * @param {!Event} event
   */
  _handleMouseDown(event) {
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
   * @param {!Accessibility.AXTreeOutline} treeOutline
   */
  constructor(axNode) {
    // Pass an empty title, the title gets made later in onattach.
    super('');

    /** @type {!Accessibility.AccessibilityNode} */
    this._axNode = axNode;

    this.selectable = true;
    this.paddingSize = 12;
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

  /**
   * @override
   */
  onbind() {
    this._inspectNodeButton = new Accessibility.InspectNodeButton(this._axNode, this.treeOutline._treePane);
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
      if (this._axNode.name().value) {
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
      this.titleElement().classList.add('no-dom-node');
    this.titleElement().appendChild(this._inspectNodeButton.element);
  }

  /**
   * @override
   */
  expand() {
    if (!this.treeOutline || !this._axNode)
      return;

    if (this._axNode.isDOMNode && this._axNode.hasOnlyUnloadedChildren()) {
      this.treeOutline._treePane.setExpanded(this._axNode.backendDOMNodeId(), true);
      this.inspectDOMNode();
      this.return;
    }

    this.treeOutline._treePane.setExpanded(this._axNode.backendDOMNodeId(), true);
    super.expand();
  }

  /**
   * @override
   */
  collapse() {
    if (!this.treeOutline || !this._axNode || this._axNode.hasOnlyUnloadedChildren())
      return;

    if (this.treeOutline._treePane)
      this.treeOutline._treePane.setExpanded(this._axNode.backendDOMNodeId(), false);
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

