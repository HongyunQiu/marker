/**
 * Build styles
 */
import './index.css';
import { IconMarker } from '@codexteam/icons'

/**
 * Marker Tool for the Editor.js
 *
 * Allows to wrap inline fragment and style it somehow.
 */
 export default class Marker {
  /**
   * Class name for term-tag
   *
   * @type {string}
   */
  static get CSS() {
    return 'cdx-marker';
  };

  /**
   * @param {{api: object}}  - Editor.js API
   */
  constructor({api, config}) {
    this.api = api;
    this.config = config || {};

    /**
     * Toolbar Button
     *
     * @type {HTMLElement|null}
     */
    this.button = null;
    /**
     * Actions wrapper element (colors palette)
     * @type {HTMLElement|null}
     */
    this.actions = null;

    /**
     * Tag represented the term
     *
     * @type {string}
     */
    this.tag = 'MARK';

    /**
     * CSS classes
     */
    this.iconClasses = {
      base: this.api.styles.inlineToolButton,
      active: this.api.styles.inlineToolButtonActive
    };

    /**
     * Available colors and current color
     */
    this.availableColors = this.config.colors || ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];
    this.defaultColor = this.config.defaultColor || 'yellow';
    this.currentColor = this.defaultColor;

    /**
     * Cache of color buttons for active state toggling
     * @type {Record<string, HTMLElement>}
     */
    this.colorButtonsByName = {};

    /**
     * Flow control for deferred color selection
     */
    this.awaitingColorSelection = false;
    this.pendingRange = null;
  }

  /**
   * Specifies Tool as Inline Toolbar Tool
   *
   * @return {boolean}
   */
  static get isInline() {
    return true;
  }

  /**
   * Create button element for Toolbar
   *
   * @return {HTMLElement}
   */
  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add(this.iconClasses.base);
    this.button.innerHTML = this.toolboxIcon;

    return this.button;
  }

  /**
   * Render actions (color palette) shown in the Inline Toolbar
   * @return {HTMLElement}
   */
  renderActions() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('cdx-marker-actions');

    this.colorButtonsByName = {};

    this.availableColors.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('cdx-marker-color');
      btn.setAttribute('data-color', name);
      btn.title = name;
      // visual preview dot
      btn.style.background = this.#previewColorFor(name);

      btn.addEventListener('click', () => {
        this.currentColor = name;
        this.#updateActiveColorButton();

        // Prefer applying to the full pending selection if present (tool-initiated)
        if (this.pendingRange) {
          // Restore selection to the pending range before wrapping
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(this.pendingRange);
          }

          this.wrap(this.pendingRange);

          this.awaitingColorSelection = false;
          this.pendingRange = null;

          if (this.api.inlineToolbar && typeof this.api.inlineToolbar.close === 'function') {
            this.api.inlineToolbar.close();
          }
          return;
        }

        // Otherwise, if selection is already inside a single highlighted tag, just recolor it
        const termTag = this.api.selection.findParentTag(this.tag, Marker.CSS);
        if (termTag) {
          termTag.setAttribute('data-color', this.currentColor);
          if (this.api.inlineToolbar && typeof this.api.inlineToolbar.close === 'function') {
            this.api.inlineToolbar.close();
          }
          return;
        }
      });

      wrapper.appendChild(btn);
      this.colorButtonsByName[name] = btn;
    });

    this.actions = wrapper;
    this.#updateActiveColorButton();

    return wrapper;
  }

  /**
   * Wrap/Unwrap selected fragment
   *
   * @param {Range} range - selected fragment
   */
  surround(range) {
    if (!range) {
      return;
    }

    let termWrapper = this.api.selection.findParentTag(this.tag, Marker.CSS);

    /**
     * If selection is already inside a marker — clicking the tool should UNWRAP (cancel marker)
     */
    if (termWrapper) {
      this.unwrap(termWrapper);
      this.awaitingColorSelection = false;
      this.pendingRange = null;

      if (this.api.inlineToolbar && typeof this.api.inlineToolbar.close === 'function') {
        this.api.inlineToolbar.close();
      }
      return;
    }

    /**
     * Otherwise, we are applying a new marker — defer until user picks a color
     * Keep palette visible for color selection
     */
    if (!this.awaitingColorSelection) {
      this.awaitingColorSelection = true;
      this.pendingRange = range.cloneRange();

      // Ensure default color is used for new wraps unless user changes it
      this.currentColor = this.defaultColor;

      // Do not modify content now
      return;
    }
  }

  /**
   * Wrap selection with term-tag
   *
   * @param {Range} range - selected fragment
   */
  wrap(range) {
    /**
     * Create a wrapper for highlighting
     */
    let marker = document.createElement(this.tag);

    marker.classList.add(Marker.CSS);
    marker.setAttribute('data-color', this.currentColor);

    /**
     * SurroundContent throws an error if the Range splits a non-Text node with only one of its boundary points
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Range/surroundContents}
     *
     * // range.surroundContents(span);
     */
    const extracted = range.extractContents();
    // Strip any existing markers inside the extracted fragment to avoid nested/old marks
    this.#stripMarkersFromFragment(extracted);
    marker.appendChild(extracted);
    range.insertNode(marker);

    /**
     * Expand (add) selection to highlighted block
     */
    this.api.selection.expandToTag(marker);
  }

  /**
   * Unwrap term-tag
   *
   * @param {HTMLElement} termWrapper - term wrapper tag
   */
  unwrap(termWrapper) {
    /**
     * Expand selection to all term-tag
     */
    this.api.selection.expandToTag(termWrapper);

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);

    let unwrappedContent = range.extractContents();

    /**
     * Remove empty term-tag
     */
    termWrapper.parentNode.removeChild(termWrapper);

    /**
     * Insert extracted content
     */
    range.insertNode(unwrappedContent);

    /**
     * Restore selection
     */
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Check and change Term's state for current selection
   */
  checkState() {
    const termTag = this.api.selection.findParentTag(this.tag, Marker.CSS);

    this.button.classList.toggle(this.iconClasses.active, !!termTag);

    // Sync current color with selection if inside a marked tag
    if (termTag && termTag.getAttribute) {
      const colorFromNode = termTag.getAttribute('data-color');
      if (colorFromNode && this.availableColors.includes(colorFromNode)) {
        this.currentColor = colorFromNode;
      }
    }
    this.#updateActiveColorButton();
  }

  /**
   * Get Tool icon's SVG
   * @return {string}
   */
  get toolboxIcon() {
    return IconMarker;
  }

  /**
   * Sanitizer rule
   * @return {{mark: {class: (boolean|*), 'data-color': boolean}}}
   */
  static get sanitize() {
    return {
      mark: {
        class: true,
        'data-color': true
      }
    };
  }

  /**
   * Private: update active state for color buttons
   */
  #updateActiveColorButton() {
    if (!this.actions) {
      return;
    }
    Object.entries(this.colorButtonsByName).forEach(([name, btn]) => {
      if (name === this.currentColor) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
  }

  /**
   * Private: map color name to preview color (solid) for the palette button
   * @param {string} name
   * @return {string}
   */
  #previewColorFor(name) {
    switch (name) {
      case 'yellow': return '#F5EB6F';
      case 'green': return '#4CAF50';
      case 'blue': return '#2196F3';
      case 'pink': return '#E91E63';
      case 'orange': return '#FF9800';
      case 'purple': return '#9C27B0';
      default: return name; // allow custom CSS color strings
    }
  }

  /**
   * Private: remove existing marker tags from a DocumentFragment before re-wrapping
   * @param {DocumentFragment} fragment
   */
  #stripMarkersFromFragment(fragment) {
    if (!fragment) {
      return;
    }

    // Find all existing <mark class="cdx-marker"> nodes within the fragment
    const nodes = typeof fragment.querySelectorAll === 'function'
      ? fragment.querySelectorAll(`mark.${Marker.CSS}`)
      : [];

    nodes.forEach((node) => {
      const parent = node.parentNode;
      if (!parent) {
        return;
      }
      // Move children out of the mark, then remove the mark element
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    });
  }
}

