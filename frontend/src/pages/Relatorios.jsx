import { useEffect, useMemo, useState } from 'react';
import { api, brl, dataHora, duracao } from '../api';
import { Alerta, Badge, Campo, Card, Carregando, SelectGaragem, TipoVeiculo, Vazio, useAcao, useCarregar } from '../ui';

const PERIODOS = [
  { id: '24h', nome: '24 horas', ms: 864e5 },
  { id: '7d', nome: '7 dias', ms: 7 * 864e5 },
  { id: '30d', nome: '30 dias', ms: 30 * 864e5 },
];

const LIMITE_TABELA = 200;

// Faturamento agrupado por hora (24h) ou por dia (7d/30d).
function Grafico({ sessoes, porHora, inicio }) {
  const barras = useMemo(() => {
    const chave = (d) => {
      const x = new Date(d);
      return porHora
        ? `${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}h`
        : `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
    };
    // todas as faixas do período, mesmo sem movimento
    const mapa = new Map();
    const passo = porHora ? 36e5 : 864e5;
    for (let t = new Date(inicio).getTime(); t <= Date.now(); t += passo) mapa.set(chave(t), 0);
    for (const s of sessoes) {
      if (s.status !== 'FECHADA') continue;
      const k = chave(s.saida || s.entrada);
      mapa.set(k, (mapa.get(k) || 0) + (s.valor || 0));
    }
    return [...mapa.entries()];
  }, [sessoes, porHora, inicio]);

  const max = Math.max(...barras.map(([, v]) => v), 1);
  const rotuloCada = Math.ceil(barras.length / 12);

  return (
    <div className="grafico">
      {barras.map(([k, v], i) => (
        <div className="col" key={k} title={`${k}: ${brl(v)}`}>
          <i style={{ height: `${(v / max) * 100}%` }} />
          <small style={{ visibility: i % rotuloCada === 0 ? 'visible' : 'hidden' }}>{k}</small>
        </div>
      ))}
    </div>
  );
}

function SessoesGaragem({ garagens }) {
  const ativas = garagens.filter((g) => g.ativa);
  const [garagemId, setGaragemId] = useState('');
  const [periodo, setPeriodo] = useState('7d');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!garagemId && ativas.length) setGaragemId(ativas[0]._id);
  }, [ativas, garagemId]);

  const p = PERIODOS.find((x) => x.id === periodo);
  const { dados, erro, carregando } = useCarregar(() => {
    if (!garagemId) return Promise.resolve(null);
    const inicio = new Date(Date.now() - p.ms).toISOString();
    return api.sessoesGaragem(garagemId, { inicio, status });
  }, [garagemId, periodo, status]);

  const r = dados?.resumo;

  return (
    <div className="pilha">
      <Card>
        <div className="linha">
          <Campo label="Garagem">
            <SelectGaragem garagens={garagens} valor={garagemId} onChange={setGaragemId} apenasAtivas={false} />
          </Campo>
          <div className="fixo">
            <Campo label="Período">
              <div className="segmentado">
                {PERIODOS.map((x) => (
                  <button key={x.id} type="button" className={x.id === periodo ? 'ativo' : ''} onClick={() => setPeriodo(x.id)}>
                    {x.nome}
                  </button>
                ))}
              </div>
            </Campo>
          </div>
          <div className="fixo" style={{ width: 160 }}>
            <Campo label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="ABERTA">Abertas</option>
                <option value="FECHADA">Fechadas</option>
              </select>
            </Campo>
          </div>
        </div>
        {dados && (
          <span className="cassandra-info">
            <Badge cor="azul">Cassandra</Badge>
            {dados.particoes_lidas} partição(ões) <span className="mono">(garagem_id, dia)</span> lidas em paralelo ·{' '}
            {dados.tempo_consulta_ms} ms
          </span>
        )}
      </Card>

      <Alerta>{erro}</Alerta>
      {carregando && !dados && <Carregando />}

      {r && (
        <>
          <div className="metricas">
            <div className="metrica">
              <span>Faturamento</span>
              <strong>{brl(r.faturamento)}</strong>
            </div>
            <div className="metrica">
              <span>Sessões</span>
              <strong>{r.total.toLocaleString('pt-BR')}</strong>
              <small>
                {r.abertas} abertas · {r.fechadas} fechadas
              </small>
            </div>
            <div className="metrica">
              <span>Ticket médio (avulso)</span>
              <strong>{brl(r.ticket_medio_avulso)}</strong>
            </div>
            <div className="metrica">
              <span>Permanência média</span>
              <strong>{duracao(r.permanencia_media_min)}</strong>
            </div>
            <div className="metrica">
              <span>Mensalistas / avulsos</span>
              <strong>
                {r.mensalistas} / {r.avulsos}
              </strong>
              <small>{r.total ? Math.round((r.mensalistas / r.total) * 100) : 0}% mensalistas</small>
            </div>
          </div>

          <Card titulo={`Faturamento por ${periodo === '24h' ? 'hora' : 'dia'}`}>
            <Grafico sessoes={dados.sessoes} porHora={periodo === '24h'} inicio={dados.inicio} />
          </Card>

          <Card titulo={`Sessões${dados.sessoes.length > LIMITE_TABELA ? ` (mostrando ${LIMITE_TABELA} de ${dados.sessoes.length})` : ''}`}>
            {dados.sessoes.length === 0 ? (
              <Vazio>Nenhuma sessão no período.</Vazio>
            ) : (
              <SessoesTabela sessoes={dados.sessoes.slice(0, LIMITE_TABELA)} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SessoesTabela({ sessoes, comGaragem }) {
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            {!comGaragem && <th>Placa</th>}
            {comGaragem && <th>Garagem</th>}
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th className="num">Permanência</th>
            <th className="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s) => (
            <tr key={s.sessao_id}>
              {!comGaragem && (
                <td>
                  <span className="placa">{s.placa}</span>
                </td>
              )}
              {comGaragem && <td>{s.garagem_nome}</td>}
              <td>
                <TipoVeiculo tipo={s.tipo_veiculo} />
              </td>
              <td>
                <Badge cor={s.mensalista ? 'azul' : 'cinza'}>{s.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
              </td>
              <td>{dataHora(s.entrada)}</td>
              <td>{s.status === 'ABERTA' ? <Badge cor="amarelo">Estacionado</Badge> : dataHora(s.saida)}</td>
              <td className="num">{duracao(s.minutos)}</td>
              <td className="num">{s.status === 'FECHADA' ? brl(s.valor) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoricoVeiculo() {
  const [placa, setPlaca] = useState('');
  const [dados, setDados] = useState(null);
  const { ocupado, erro, executar } = useAcao();

  return (
    <Card titulo="Histórico de um veículo">
      <form
        className="linha"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await executar(() => api.historicoVeiculo(placa));
          if (r) setDados(r);
        }}
      >
        <Campo label="Placa">
          <input className="input-placa" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" required />
        </Campo>
        <div className="fixo" style={{ marginBottom: 12 }}>
          <button className="btn" disabled={ocupado}>
            Buscar
          </button>
        </div>
      </form>
      <Alerta>{erro}</Alerta>
      {dados &&
        (dados.sessoes.length === 0 ? (
          <Vazio>Nenhuma sessão para {dados.placa}.</Vazio>
        ) : (
          <>
            <p className="suave" style={{ marginTop: 0 }}>
              {dados.resumo.total} sessão(ões) · total pago {brl(dados.resumo.faturamento)} · leitura de uma partição (
              <span className="mono">placa</span>) já ordenada por entrada
            </p>
            <SessoesTabela sessoes={dados.sessoes} comGaragem />
          </>
        ))}
    </Card>
  );
}

export default function Relatorios({ garagens }) {
  return (
    <div className="pilha">
      <SessoesGaragem garagens={garagens} />
      <HistoricoVeiculo />
    </div>
  );
}
