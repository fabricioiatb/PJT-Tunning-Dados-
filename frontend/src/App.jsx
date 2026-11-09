import { useEffect, useState } from 'react';
import { api } from './api';
import { useCarregar } from './ui';
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

// Indicador de saúde dos 3 serviços (consulta /health a cada 10s).
function StatusServicos() {
  const [status, setStatus] = useState({});
  useEffect(() => {
    const checar = () =>
      SERVICOS.forEach((s) =>
        api
          .saude(s.id)
          .then(() => setStatus((st) => ({ ...st, [s.id]: true })))
          .catch(() => setStatus((st) => ({ ...st, [s.id]: false })))
      );
    checar();
    const t = setInterval(checar, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="status-servicos">
      {SERVICOS.map((s) => (
        <span
          key={s.id}
          className={`status-pill ${status[s.id] === undefined ? '' : status[s.id] ? 'ok' : 'off'}`}
          title={`Serviço de ${s.id} — ${status[s.id] === false ? 'fora do ar' : 'no ar'}`}
        >
          <i />
          {s.banco}
        </span>
      ))}
    </div>
  );
}

const abaInicial = () => {
  const h = window.location.hash.slice(1);
  return ABAS.some((a) => a.id === h) ? h : 'operacao';
};

export default function App() {
  const [aba, setAba] = useState(abaInicial);
  // Lista de garagens compartilhada por todas as telas (selects).
  const garagens = useCarregar(() => api.garagens(), []);

  // A aba fica no endereço (#clientes...): dá para recarregar, compartilhar o
  // link e usar o botão "voltar" do navegador.
  useEffect(() => {
    const aoMudar = () => setAba(abaInicial());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const trocar = (id) => {
    window.location.hash = id;
  };

  const { Comp } = ABAS.find((a) => a.id === aba);

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <span className="logo">P</span>
          <div>
            <strong>Garagem Poliglota</strong>
            <small>Polyglot Persistence · CCD410</small>
          </div>
        </div>
        <nav className="abas">
          {ABAS.map((a) => (
            <button key={a.id} className={a.id === aba ? 'ativa' : ''} onClick={() => trocar(a.id)}>
              {a.nome}
            </button>
          ))}
        </nav>
        <StatusServicos />
      </header>

      <main className="conteudo">
        <Comp garagens={garagens.dados || []} erroGaragens={garagens.erro} recarregarGaragens={garagens.recarregar} />
      </main>
    </div>
  );
}
