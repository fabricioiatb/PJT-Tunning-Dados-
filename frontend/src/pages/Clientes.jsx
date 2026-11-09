import { useEffect, useState } from 'react';
import { api, brl, TIPOS, NOME_TIPO } from '../api';
import { Alerta, Badge, Campo, Card, Carregando, SelectGaragem, TipoVeiculo, Vazio, useAcao, useCarregar } from '../ui';

const fmtCpf = (c) => (c?.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const fmtData = (d) => (d ? d.split('-').reverse().join('/') : '—');

function NovoCliente({ onCriado, onCancelar }) {
  const [f, setF] = useState({ nome: '', cpf: '', email: '', telefone: '', placa: '', modelo: '', tipo: 'CARRO' });
  const { ocupado, erro, executar } = useAcao();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    const body = { nome: f.nome, cpf: f.cpf, email: f.email || undefined, telefone: f.telefone || undefined };
    if (f.placa) body.veiculos = [{ placa: f.placa, modelo: f.modelo || undefined, tipo: f.tipo }];
    const r = await executar(() => api.criarCliente(body));
    if (r) onCriado(r.id);
  };

  return (
    <Card titulo="Novo cliente">
      <form onSubmit={enviar}>
        <Campo label="Nome">
          <input value={f.nome} onChange={set('nome')} required />
        </Campo>
        <div className="linha">
          <Campo label="CPF">
            <input value={f.cpf} onChange={set('cpf')} placeholder="000.000.000-00" required />
          </Campo>
          <Campo label="Telefone">
            <input value={f.telefone} onChange={set('telefone')} />
          </Campo>
        </div>
        <Campo label="E-mail">
          <input type="email" value={f.email} onChange={set('email')} />
        </Campo>
        <h3>Veículo (opcional)</h3>
        <div className="linha">
          <Campo label="Placa">
            <input className="mono" value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value.toUpperCase() })} />
          </Campo>
          <Campo label="Modelo">
            <input value={f.modelo} onChange={set('modelo')} />
          </Campo>
          <Campo label="Tipo">
            <select value={f.tipo} onChange={set('tipo')}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <p className="suave" style={{ fontSize: 12, marginTop: 0 }}>
          Cliente e veículo são gravados na mesma transação no PostgreSQL: se a placa for inválida ou repetida, o
          cliente também não é criado.
        </p>
        <Alerta>{erro}</Alerta>
        <div className="linha">
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn btn-primaria" disabled={ocupado}>
            Salvar
          </button>
        </div>
      </form>
    </Card>
  );
}

function DetalheCliente({ id, garagens, onAlterado, onRemovido }) {
  const { dados: c, erro, carregando, recarregar } = useCarregar(() => api.cliente(id), [id]);
  const acao = useAcao();
  const [veiculo, setVeiculo] = useState({ placa: '', modelo: '', tipo: 'CARRO' });
  const [plano, setPlano] = useState({ garagem_id: '', valor_mensal: '' });

  const nomeGaragem = (gid) => garagens.find((g) => g._id === gid)?.nome || gid;

  const depois = async (fn) => {
    const r = await acao.executar(fn);
    if (r !== undefined) {
      await recarregar();
      onAlterado();
    }
    return r;
  };

  if (carregando && !c) return <Card><Carregando /></Card>;
  if (erro) return <Card><Alerta>{erro}</Alerta></Card>;
  if (!c) return null;

  return (
    <div className="pilha">
      <Card
        titulo={c.nome}
        acoes={
          <button
            className="btn btn-pequeno btn-perigo"
            onClick={async () => {
              if (!confirm(`Excluir ${c.nome}? Veículos e planos também serão removidos.`)) return;
              const r = await acao.executar(() => api.removerCliente(c.id));
              if (r !== undefined) onRemovido();
            }}
          >
            Excluir cliente
          </button>
        }
      >
        <div className="entre" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <Badge cor={c.tipo === 'MENSALISTA' ? 'azul' : 'cinza'}>{c.tipo}</Badge>
          <span className="suave">CPF {fmtCpf(c.cpf)}</span>
          {c.email && <span className="suave">· {c.email}</span>}
          {c.telefone && <span className="suave">· {c.telefone}</span>}
        </div>
        <p className="suave" style={{ fontSize: 12, marginBottom: 0 }}>
          O tipo é derivado: <b>MENSALISTA</b> se existir um plano vigente; senão <b>AVULSO</b>.
        </p>
      </Card>

      <Alerta onFechar={() => acao.setErro(null)}>{acao.erro}</Alerta>

      <Card titulo={`Veículos (${c.veiculos.length})`}>
        {c.veiculos.length === 0 && <Vazio>Nenhum veículo.</Vazio>}
        {c.veiculos.map((v) => (
          <div className="item-linha" key={v.id}>
            <div className="entre" style={{ justifyContent: 'flex-start' }}>
              <span className="placa">{v.placa}</span>
              <TipoVeiculo tipo={v.tipo} />
              <span className="suave">{[v.modelo, v.cor].filter(Boolean).join(' · ')}</span>
            </div>
            <button
              className="btn btn-pequeno btn-perigo"
              onClick={() => confirm(`Remover o veículo ${v.placa}?`) && depois(() => api.removerVeiculo(v.id))}
            >
              Remover
            </button>
          </div>
        ))}
        <form
          className="linha"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await depois(() => api.criarVeiculo({ cliente_id: c.id, ...veiculo }));
            if (r) setVeiculo({ placa: '', modelo: '', tipo: 'CARRO' });
          }}
        >
          <Campo label="Placa">
            <input
              className="mono"
              value={veiculo.placa}
              onChange={(e) => setVeiculo({ ...veiculo, placa: e.target.value.toUpperCase() })}
              required
            />
          </Campo>
          <Campo label="Modelo">
            <input value={veiculo.modelo} onChange={(e) => setVeiculo({ ...veiculo, modelo: e.target.value })} />
          </Campo>
          <Campo label="Tipo">
            <select value={veiculo.tipo} onChange={(e) => setVeiculo({ ...veiculo, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
          <div className="fixo" style={{ marginBottom: 12 }}>
            <button className="btn" disabled={acao.ocupado}>
              Adicionar
            </button>
          </div>
        </form>
      </Card>

      <Card titulo="Planos de mensalista">
        {c.planos.length === 0 && <Vazio>Nenhum plano — cliente avulso.</Vazio>}
        {c.planos.map((p) => (
          <div className="item-linha" key={p.id}>
            <div>
              <strong>{nomeGaragem(p.garagem_id)}</strong>{' '}
              {p.vigente ? <Badge cor="verde">Vigente</Badge> : <Badge>Encerrado</Badge>}
              <div className="suave" style={{ fontSize: 12 }}>
                {brl(p.valor_mensal)}/mês · desde {fmtData(p.data_inicio)}
                {p.data_fim && ` até ${fmtData(p.data_fim)}`}
              </div>
            </div>
            {p.ativo && (
              <button
                className="btn btn-pequeno"
                onClick={() => confirm('Encerrar este plano?') && depois(() => api.encerrarPlano(p.id))}
              >
                Encerrar
              </button>
            )}
          </div>
        ))}
        <form
          className="linha"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await depois(() =>
              api.criarPlano({ cliente_id: c.id, garagem_id: plano.garagem_id, valor_mensal: Number(plano.valor_mensal) })
            );
            if (r) setPlano({ garagem_id: '', valor_mensal: '' });
          }}
        >
          <Campo label="Garagem">
            <SelectGaragem
              garagens={garagens}
              valor={plano.garagem_id}
              onChange={(v) => setPlano({ ...plano, garagem_id: v })}
              vazio="Selecione…"
            />
          </Campo>
          <Campo label="Valor mensal (R$)">
            <input
              type="number"
              min="1"
              step="0.01"
              value={plano.valor_mensal}
              onChange={(e) => setPlano({ ...plano, valor_mensal: e.target.value })}
              required
            />
          </Campo>
          <div className="fixo" style={{ marginBottom: 12 }}>
            <button className="btn" disabled={acao.ocupado || !plano.garagem_id}>
              Criar plano
            </button>
          </div>
        </form>
        <p className="suave" style={{ fontSize: 12, margin: 0 }}>
          A garagem é validada no Serviço de Garagens (MongoDB) — integridade entre bancos feita pela aplicação. Um
          índice único parcial no PostgreSQL impede dois planos ativos na mesma garagem.
        </p>
      </Card>
    </div>
  );
}

export default function Clientes({ garagens }) {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [sel, setSel] = useState(null);
  const [novo, setNovo] = useState(false);
  const lista = useCarregar(() => api.clientes(termo), [termo]);

  // busca com pequeno atraso enquanto digita
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="grade grade-2">
      <Card
        titulo="Clientes"
        acoes={
          <button
            className="btn btn-primaria btn-pequeno"
            onClick={() => {
              setNovo(true);
              setSel(null);
            }}
          >
            + Novo
          </button>
        }
      >
        <Campo label="Buscar por nome ou CPF">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar…" />
        </Campo>
        <Alerta>{lista.erro}</Alerta>
        <div className="lista-clientes">
          {lista.carregando && !lista.dados && <Carregando />}
          {lista.dados?.length === 0 && <Vazio>Nenhum cliente encontrado.</Vazio>}
          {lista.dados?.map((c) => (
            <button
              key={c.id}
              className={sel === c.id ? 'sel' : ''}
              onClick={() => {
                setSel(c.id);
                setNovo(false);
              }}
            >
              <div>
                {c.nome}
                <small>
                  {fmtCpf(c.cpf)} · {c.qtd_veiculos} veículo(s)
                </small>
              </div>
              <Badge cor={c.tipo === 'MENSALISTA' ? 'azul' : 'cinza'}>{c.tipo === 'MENSALISTA' ? 'Mensal' : 'Avulso'}</Badge>
            </button>
          ))}
        </div>
      </Card>

      <div>
        {novo && (
          <NovoCliente
            onCancelar={() => setNovo(false)}
            onCriado={(id) => {
              setNovo(false);
              setSel(id);
              lista.recarregar();
            }}
          />
        )}
        {!novo && sel && (
          <DetalheCliente
            id={sel}
            garagens={garagens}
            onAlterado={lista.recarregar}
            onRemovido={() => {
              setSel(null);
              lista.recarregar();
            }}
          />
        )}
        {!novo && !sel && (
          <Card>
            <Vazio>Selecione um cliente ou cadastre um novo.</Vazio>
          </Card>
        )}
      </div>
    </div>
  );
}
