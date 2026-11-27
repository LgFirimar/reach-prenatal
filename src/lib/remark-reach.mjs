// Remark plugin for the two content directives:
//
//   :todo[proposed text]   a fact not yet confirmed with the clinic
//   :data[clinic.phone]    a value from content/data/*.yaml
//
// Preview builds show the proposed value highlighted with a TODO-VERIFY badge.
// Production builds never show an unconfirmed value: they show "Ask clinic staff".
import { visit } from 'unist-util-visit';
import { buildMode, siteData, dataEntry, uiStrings } from './site.mjs';

function langFromFile(file) {
  const m = String(file?.path ?? file?.history?.[0] ?? '').match(/content[\\/]pages[\\/]([^\\/]+)[\\/]/);
  return m ? m[1] : 'en';
}

const text = (value) => ({ type: 'text', value });

function hast(node, tag, props, children) {
  node.data = { ...(node.data ?? {}), hName: tag, hProperties: props };
  node.children = children;
}

function telHref(entry) {
  return 'tel:' + String(entry.dial ?? entry.value).replace(/[^\d+]/g, '');
}

export function renderTodo(node, valueText, { preview, ui }) {
  if (preview) {
    hast(node, 'mark', { className: ['todo'], dataTodo: '' }, [
      text(valueText || '…'),
      { type: 'emphasis', data: { hName: 'small', hProperties: { className: ['todo-badge'] } }, children: [text(ui.todo_badge)] },
    ]);
  } else {
    hast(node, 'span', { className: ['ask-staff'] }, [text(ui.ask_staff)]);
  }
}

export default function remarkReach() {
  const data = siteData();
  return (tree, file) => {
    const preview = buildMode() === 'preview';
    const ui = uiStrings(langFromFile(file));
    visit(tree, (node) => {
      if (node.type !== 'textDirective' && node.type !== 'leafDirective' && node.type !== 'containerDirective') return;
      if (node.name === 'box' && node.type === 'containerDirective') {
        // :::box{tone="red"} ... ::: → coloured card (red / orange / green / blue)
        const tone = ['red', 'orange', 'green', 'blue'].includes(node.attributes?.tone) ? node.attributes.tone : 'blue';
        node.data = { ...(node.data ?? {}), hName: 'section', hProperties: { className: ['box', `box-${tone}`] } };
        return;
      }
      const label = (node.children ?? []).map((c) => c.value ?? '').join('');
      if (node.name === 'todo') {
        renderTodo(node, label, { preview, ui });
      } else if (node.name === 'data') {
        const entry = dataEntry(data, label.trim());
        if (!entry) {
          file.fail(`Unknown data key ":data[${label}]". Add it to content/data/*.yaml.`, node);
        }
        if (!entry.verified || !entry.value) {
          renderTodo(node, entry.value, { preview, ui });
          if (preview && entry.tel && entry.value) node.data.hProperties.dataTel = telHref(entry);
        } else if (entry.tel) {
          hast(node, 'a', { href: telHref(entry), className: ['tel'], dir: 'ltr' }, [text(entry.value)]);
        } else {
          hast(node, 'span', {}, [text(entry.value)]);
        }
      } else if (node.type === 'textDirective') {
        // Not ours (e.g. "Note:something"): put the original text back.
        node.type = 'text';
        node.value = ':' + node.name + label;
        delete node.children;
      }
    });
  };
}
