import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useCarregar } from './ui';
import { lerHash, useHash } from './url';
import Operacao from './pages/Operacao';
import Clientes from './pages/Clientes';
import Garagens from './pages/Garagens';
import Relatorios from './pages/Relatorios';

const ABAS = [
  { id: 'operacao', nome: 'Operação', Comp: Operacao },
  { id: 'clientes', nome: 'Clientes', Comp: Clientes },
  { id: 'garagens', nome: 'Garagens', Comp: Garagens },
  { id: 'relatorios', nome: 'Relatórios', Comp: Relatorios },
];

const SERVICOS = [
  { id: 'clientes', banco: 'PostgreSQL' },
  { id: 'garagens', banco: 'MongoDB' },
  { id: 'sessoes', banco: 'Cassandra' },
];

// Saúde dos 3 serviços (GET /health a cada 10s).
function StatusServicos() {
  const [status, setStatus] = useState({});
  useEffect(() => {
    const checar = () =>
      SERVICOS.forEach((s) =>
        api
          .saude(s.id)
          .then(() => setStatus((st) => ({ ...st, [s.id]: true })))
          .catch(() => setStatus((st) => ({ ...st, [s.id]: false }))),
      );
    checar();
    const t = setInterval(checar, 10000);
    return () => clearInterval(t);
  }, []);

  const fora = SERVICOS.filter((s) => status[s.id] === false);

  return (
    <div className="status-servicos" role="status" aria-live="polite" aria-label="Status dos bancos de dados">
      {SERVICOS.map((s) => {
        const st = status[s.id] === undefined ? 'verificando' : status[s.id] ? 'no ar' : 'fora do ar';
        return (
          <span key={s.id} className={`status-pill ${status[s.id] === undefined ? '' : status[s.id] ? 'ok' : 'off'}`}>
            <i aria-hidden="true" />
            <span translate="no">{s.banco}</span>
            <span className="sr-only">: {st}</span>
          </span>
        );
      })}
      {fora.length > 0 && <span className="sr-only">{fora.length} serviço(s) fora do ar</span>}
    </div>
  );
}

export default function App() {
  useHash(); // re-renderiza quando o endereço muda
  const id = lerHash().aba;
  const aba = ABAS.find((a) => a.id === id) || ABAS[0];
  const mainRef = useRef(null);

  // Lista de garagens compartilhada pelas telas (selects).
  const garagens = useCarregar(() => api.garagens(), []);

  useEffect(() => {
    document.title = `${aba.nome} · Garagem Poliglota`;
  }, [aba]);

  return (
    <div className="app">
      <a
        href="#conteudo"
        className="pular"
        onClick={(e) => {
          e.preventDefault(); // não troca o hash (que guarda a aba)
          mainRef.current?.focus();
        }}
      >
        Pular para o conteúdo
      </a>

      <header className="topo">
        <div className="marca">
          <span className="logo" aria-hidden="true">
            P
          </span>
          <div>
            <strong>Garagem Poliglota</strong>
            <small>
              Polyglot Persistence · <span translate="no">CCD410</span>
            </small>
          </div>
        </div>
        <nav className="abas" aria-label="Seções">
          {ABAS.map((a) => (
            <a key={a.id} href={`#${a.id}`} aria-current={a.id === aba.id ? 'page' : undefined}>
              {a.nome}
            </a>
          ))}
        </nav>
        <StatusServicos />
      </header>

      <main id="conteudo" ref={mainRef} tabIndex={-1} className="conteudo">
        <aba.Comp
          garagens={garagens.dados || []}
          erroGaragens={garagens.erro}
          recarregarGaragens={garagens.recarregar}
        />
      </main>
    </div>
  );
}
