import { useCallback, useEffect, useRef, useState } from 'react';
import { NOME_TIPO } from './api';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

// Carrega dados assíncronos com estado de loading/erro e função de recarga.
export function useCarregar(fn, deps = []) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await fn());
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, deps);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar };
}

// Executa uma ação (POST/DELETE...) guardando erro e estado "ocupado".
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const executar = async (fn) => {
    setOcupado(true);
    setErro(null);
    try {
      return await fn();
    } catch (e) {
      setErro(e.message);
      return undefined;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, erro, setErro, executar };
}

// Avisa antes de sair da página com um formulário preenchido.
export function useAvisoSaida(sujo) {
  useEffect(() => {
    if (!sujo) return undefined;
    const aviso = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sujo]);
}

// Diálogo de confirmação acessível (<dialog> nativo: foco preso, Esc fecha).
// Uso: const [confirmar, dialogo] = useConfirmar();
//      if (await confirmar({ titulo, texto, acao: 'Excluir garagem' })) ...
export function useConfirmar() {
  const ref = useRef(null);
  const [opcoes, setOpcoes] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback((o) => {
    setOpcoes(o);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (opcoes && ref.current && !ref.current.open) ref.current.showModal();
  }, [opcoes]);

  const fechar = (resposta) => {
    ref.current?.close();
    resolver.current?.(resposta);
    resolver.current = null;
    setOpcoes(null);
  };

  const dialogo = (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby="dialogo-titulo"
      aria-describedby="dialogo-texto"
      onCancel={(e) => {
        e.preventDefault();
        fechar(false);
      }}
    >
      {opcoes && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            fechar(true);
          }}
        >
          <h2 id="dialogo-titulo">{opcoes.titulo}</h2>
          <p id="dialogo-texto">{opcoes.texto}</p>
          <div className="dialogo-acoes">
            <button type="button" className="btn" onClick={() => fechar(false)} autoFocus>
              Cancelar
            </button>
            <button type="submit" className={`btn ${opcoes.perigo === false ? 'btn-primaria' : 'btn-perigo-cheio'}`}>
              {opcoes.acao}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );

  return [confirmar, dialogo];
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export const CabecalhoPagina = ({ titulo, descricao, acoes }) => (
  <div className="pagina-cabecalho">
    <div>
      <h1>{titulo}</h1>
      {descricao && <p>{descricao}</p>}
    </div>
    {acoes && <div className="pagina-acoes">{acoes}</div>}
  </div>
);

export const Card = ({ titulo, acoes, children, className = '', id }) => (
  <section className={`card ${className}`} aria-labelledby={titulo && id ? `${id}-titulo` : undefined}>
    {(titulo || acoes) && (
      <header className="card-head">
        {titulo && <h2 id={id ? `${id}-titulo` : undefined}>{titulo}</h2>}
        {acoes && <div className="card-acoes">{acoes}</div>}
      </header>
    )}
    {children}
  </section>
);

// Mensagem de feedback. Erros usam role="alert"; os demais, aria-live polite.
// focar=true leva o foco à mensagem quando ela aparece (erro de envio).
export function Alerta({ tipo = 'erro', children, onFechar, focar = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (focar && children) ref.current?.focus();
  }, [focar, children]);
  if (!children) return null;
  return (
    <div
      ref={ref}
      tabIndex={focar ? -1 : undefined}
      className={`alerta alerta-${tipo}`}
      role={tipo === 'erro' ? 'alert' : 'status'}
      aria-live={tipo === 'erro' ? 'assertive' : 'polite'}
    >
      <span className="alerta-texto">{children}</span>
      {onFechar && (
        <button type="button" className="alerta-x" onClick={onFechar} aria-label="Fechar mensagem">
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}

export const Badge = ({ cor = 'cinza', children }) => <span className={`badge badge-${cor}`}>{children}</span>;

export const TipoVeiculo = ({ tipo }) => (
  <span className={`tipo tipo-${(tipo || '').toLowerCase()}`}>
    <i aria-hidden="true" />
    {NOME_TIPO[tipo] || tipo}
  </span>
);

export const Placa = ({ children }) => (
  <span className="placa" translate="no">
    {children}
  </span>
);

export const Vazio = ({ titulo, children }) => (
  <div className="vazio">
    {titulo && <strong>{titulo}</strong>}
    {children && <p>{children}</p>}
  </div>
);

export const Carregando = ({ texto = 'Carregando…' }) => (
  <p className="vazio" role="status" aria-live="polite">
    <Spinner /> {texto}
  </p>
);

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

// Botão de envio: habilitado até a requisição começar; spinner durante.
export const BotaoEnviar = ({ ocupado, children, textoOcupado, className = 'btn-primaria', ...props }) => (
  <button type="submit" className={`btn ${className}`} disabled={ocupado} aria-busy={ocupado || undefined} {...props}>
    {ocupado && <Spinner />}
    {ocupado ? textoOcupado || children : children}
  </button>
);

// Rótulo clicável envolvendo o controle.
export const Campo = ({ label, children, dica, className = '' }) => (
  <label className={`campo ${className}`}>
    <span className="campo-label">{label}</span>
    {children}
    {dica && <span className="campo-dica">{dica}</span>}
  </label>
);

// Campo de placa: sem autocomplete/spellcheck, maiúsculas, padrão no placeholder.
export const InputPlaca = ({ valor, onChange, name = 'placa', ...props }) => (
  <input
    className="input-placa"
    name={name}
    value={valor}
    onChange={(e) => onChange(e.target.value.toUpperCase())}
    placeholder="ex.: ABC1D23…"
    maxLength={8}
    autoComplete="off"
    autoCapitalize="characters"
    spellCheck={false}
    translate="no"
    required
    {...props}
  />
);

export function SelectGaragem({
  garagens,
  valor,
  onChange,
  apenasAtivas = true,
  vazio,
  name = 'garagem',
  required = true,
}) {
  const lista = (garagens || []).filter((g) => !apenasAtivas || g.ativa);
  return (
    <select name={name} value={valor || ''} onChange={(e) => onChange(e.target.value)} required={required}>
      {vazio && <option value="">{vazio}</option>}
      {lista.map((g) => (
        <option key={g._id} value={g._id}>
          {g.nome} — {g.endereco?.cidade}
          {g.ativa ? '' : ' (inativa)'}
        </option>
      ))}
    </select>
  );
}
