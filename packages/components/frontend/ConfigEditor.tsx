import 'schemastery-react/lib/schemastery-react.css';

import { Allotment } from 'allotment';
import { diffLines } from 'diff';
import yaml from 'js-yaml';
import React from 'react';
import { createSchemasteryReact } from 'schemastery-react';
import { ComponentsContext } from './provider';

const locales = {
  zh: 'zh-CN',
  en: 'en-US',
};

function MonacoContainer({
  config, setValue, setError, monaco, schema, editorCallback, size,
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [editor, setEditor] = React.useState<any>(null);
  const [model, setModel] = React.useState<any>(null);
  const { codeFontFamily } = React.useContext(ComponentsContext);

  React.useEffect(() => {
    if (!monaco) return;
    const interval = setInterval(() => {
      monaco.editor.remeasureFonts();
    }, 1000);
    return () => clearInterval(interval); // eslint-disable-line consistent-return
  }, [monaco]);

  React.useEffect(() => {
    const listener = () => {
      if (!editor) return;
      editor.layout();
    };
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, [editor]);
  React.useEffect(() => {
    if (!editor) return;
    editor.layout();
  }, [size]);
  React.useEffect(() => {
    if (!editor) return;
    const disposable = editor.onDidChangeModelContent(() => {
      const val = editor.getValue({ lineEnding: '\n', preserveBOM: false });
      try {
        const loaded = yaml.load(val);
        schema(loaded);
        setValue(val);
        setError('');
      } catch (err) {
        setError(err.message);
      }
    });
    return () => disposable.dispose(); // eslint-disable-line
  }, [editor, setValue, setError]);
  React.useEffect(() => {
    if (!editorRef.current || loading) return;
    setLoading(true);
    // eslint-disable-next-line
    const model = monaco.editor.createModel(config, 'yaml', monaco.Uri.parse('hydro://system/setting.yaml'));
    setModel(model);
    const e = monaco.editor.create(editorRef.current, {
      theme: 'vs-light',
      lineNumbers: 'off',
      glyphMargin: true,
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
      model,
      minimap: { enabled: false },
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      fontFamily: codeFontFamily,
      fontLigatures: '',
      unicodeHighlight: {
        ambiguousCharacters: true,
      },
    });
    editorCallback(e, model, editorRef.current);
    setEditor(e);
  }, [editorRef.current]);
  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getValue({ lineEnding: '\n', preserveBOM: false });
    const diff = diffLines(current, config);
    const ops: { range: any; text: string }[] = [];
    let cursor = 1;
    for (const line of diff) {
      if (line.added) {
        let range = model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: line.value });
      } else if (line.removed) {
        let range = model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        cursor += line.count;
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: '' });
      } else cursor += line.count;
    }
    model.pushEditOperations([], ops, undefined);
  }, [editor, config]);
  return (
    <div ref={editorRef} style={{
      width: '100%', height: '500px',
    }} />
  );
}

export default function ConfigEditor({
  schema, config, monaco, Markdown, onSave, registerAction, sidebar,
}) {
  const [value, setValue] = React.useState(yaml.load(config));
  const [info, setInfo] = React.useState('');
  const [stringConfig, setStringConfig] = React.useState(config);
  const initial = React.useMemo(() => yaml.load(config), []);
  const { i18n } = React.useContext(ComponentsContext);

  const Form = React.useMemo(() => createSchemasteryReact({
    locale: locales[i18n('__id')] || 'en-US',
    Markdown,
  }), []);

  const updateFromForm = React.useCallback((v) => {
    const newDump = yaml.dump(v);
    if (newDump === stringConfig) return;
    setStringConfig(newDump);
    setValue(v);
  }, [stringConfig]);
  const updateFromMonaco = React.useCallback((v) => {
    if (v === stringConfig) return;
    setStringConfig(v);
    setValue(yaml.load(v));
  }, [stringConfig]);

  const [size, setSize] = React.useState([50, 50]);

  return (<div className="fullscreen-content" style={{ backgroundColor: 'white', zIndex: 10 }}>
    <Allotment onChange={setSize}>
      <Allotment.Pane>
        <MonacoContainer
          editorCallback={registerAction} schema={schema} monaco={monaco}
          config={stringConfig} setValue={updateFromMonaco} setError={setInfo}
          size={size[0]}
        />
        <pre className="help-text">{info}</pre>
        <button onClick={() => onSave(stringConfig)} className="rounded primary button">{i18n('Save All Changes')}</button>
      </Allotment.Pane>
      <Allotment.Pane>
        <div style={{
          overflowY: 'scroll', top: 0, bottom: 0, left: 0, right: 0, position: 'absolute', marginLeft: 10,
        }}>
          <Form schema={schema} initial={initial} value={value} onChange={updateFromForm} />
        </div>
      </Allotment.Pane>
      {sidebar && <Allotment.Pane maxSize={220}>{sidebar}</Allotment.Pane>}
    </Allotment>
  </div>);
}
