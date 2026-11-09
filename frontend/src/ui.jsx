import { useCallback, useEffect, useState } from 'react';
import { NOME_TIPO } from './api';

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

  return { dados, erro, carregando, recarregar, setDados };
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

export const Card = ({ titulo, acoes, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(titulo || acoes) && (
      <header className="card-head">
        {titulo && <h2>{titulo}</h2>}
        {acoes && <div className="card-acoes">{acoes}</div>}
      </header>
    )}
    {children}
  </section>
);

export const Alerta = ({ tipo = 'erro', children, onFechar }) =>
  children ? (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onFechar && (
        <button className="alerta-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      )}
    </div>
  ) : null;

export const Badge = ({ cor = 'cinza', children }) => <span className={`badge badge-${cor}`}>{children}</span>;

export const TipoVeiculo = ({ tipo }) => (
  <span className={`tipo tipo-${(tipo || '').toLowerCase()}`}>{NOME_TIPO[tipo] || tipo}</span>
);

export const Vazio = ({ children }) => <p className="vazio">{children}</p>;

export const Carregando = () => <p className="vazio">Carregando…</p>;

export function Campo({ label, children, dica }) {
  return (
    <label className="campo">
      <span className="campo-label">{label}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

export function SelectGaragem({ garagens, valor, onChange, apenasAtivas = true, vazio }) {
  const lista = (garagens || []).filter((g) => !apenasAtivas || g.ativa);
  return (
    <select value={valor || ''} onChange={(e) => onChange(e.target.value)}>
      {vazio && <option value="">{vazio}</option>}
      {lista.map((g) => (
        <option key={g._id} value={g._id}>
          {g.nome} — {g.endereco?.cidade}
        </option>
      ))}
    </select>
  );
}
