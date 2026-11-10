import { useEffect, useMemo, useState } from 'react';
import { api, brl, dataHora, diaCurto, duracao, horaCurta, numero, pct } from '../api';
import {
  Alerta,
  Badge,
  BotaoEnviar,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  InputPlaca,
  Placa,
  SelectGaragem,
  TipoVeiculo,
  Vazio,
  useAcao,
  useCarregar,
  useConfirmar,
} from '../ui';
import { lerHash, useParamUrl } from '../url';

const PERIODOS = [
  { id: '24h', nome: '24 horas', ms: 864e5 },
  { id: '7d', nome: '7 dias', ms: 7 * 864e5 },
  { id: '30d', nome: '30 dias', ms: 30 * 864e5 },
];

const PAGINA = 200;

// Link na aba Relatórios trocando só um parâmetro.
function linkCom(chave, valor) {
  const { params } = lerHash();
  params.set(chave, valor);
  return `#relatorios?${params}`;
}

// Faturamento agrupado por hora (24h) ou por dia (7d/30d).
function Grafico({ sessoes, porHora, inicio }) {
  const barras = useMemo(() => {
    const passo = porHora ? 36e5 : 864e5;
    const inicioFaixa = (t) => {
      const d = new Date(t);
      if (porHora) d.setMinutes(0, 0, 0);
      else d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const mapa = new Map();
    for (let t = inicioFaixa(new Date(inicio).getTime()); t <= Date.now(); t += passo) mapa.set(inicioFaixa(t), 0);
    for (const s of sessoes) {
      if (s.status !== 'FECHADA') continue;
      const k = inicioFaixa(new Date(s.saida || s.entrada).getTime());
      mapa.set(k, (mapa.get(k) || 0) + (s.valor || 0));
    }
    return [...mapa.entries()].map(([t, v]) => ({ rotulo: porHora ? horaCurta(t) : diaCurto(t), valor: v }));
  }, [sessoes, porHora, inicio]);

  const max = Math.max(...barras.map((b) => b.valor), 1);
  const melhor = barras.reduce((a, b) => (b.valor > a.valor ? b : a), barras[0] || { valor: 0 });
  const rotuloCada = Math.ceil(barras.length / 12);
  const descricao = barras.length
    ? `Gráfico de barras com ${barras.length} ${porHora ? 'horas' : 'dias'}. Maior faturamento: ${brl(melhor.valor)} em ${melhor.rotulo}.`
    : 'Sem dados no período.';

  return (
    <div className="grafico" role="img" aria-label={descricao}>
      {barras.map((b, i) => (
        <div className="col" key={b.rotulo + i} title={`${b.rotulo}: ${brl(b.valor)}`} aria-hidden="true">
          <i style={{ transform: `scaleY(${b.valor / max})` }} />
          <small style={{ visibility: i % rotuloCada === 0 ? 'visible' : 'hidden' }}>{b.rotulo}</small>
        </div>
      ))}
    </div>
  );
}

// Exclusão de uma sessão com confirmação (o "D" do CRUD de sessões).
function useExcluirSessao(onExcluida) {
  const [confirmar, dialogo] = useConfirmar();
  const acao = useAcao();
  const excluir = async (s) => {
    const ok = await confirmar({
      titulo: `Excluir a sessão de ${s.placa}?`,
      texto: `Entrada em ${dataHora(s.entrada)}${s.status === 'FECHADA' ? `, valor ${brl(s.valor)}` : ' (ainda estacionado — a vaga será liberada)'}. O registro sai das tabelas do Cassandra e não pode ser recuperado.`,
      acao: 'Excluir sessão',
    });
    if (!ok) return;
    const r = await acao.executar(() => api.removerSessao(s));
    if (r !== undefined) onExcluida();
  };
  return { excluir, dialogo, erro: acao.erro, limparErro: () => acao.setErro(null), ocupado: acao.ocupado };
}

function SessoesTabela({ sessoes, comGaragem, legenda, onExcluir, ocupado }) {
  return (
    <div className="tabela-wrap">
      <table>
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">{comGaragem ? 'Garagem' : 'Placa'}</th>
            <th scope="col">Tipo</th>
            <th scope="col">Cliente</th>
            <th scope="col">Entrada</th>
            <th scope="col">Saída</th>
            <th scope="col" className="num">
              Permanência
            </th>
            <th scope="col" className="num">
              Valor
            </th>
            {onExcluir && (
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s) => (
            <tr key={s.sessao_id}>
              <td>
                {comGaragem ? (
                  <span className="truncar" style={{ display: 'block' }}>
                    {s.garagem_nome}
                  </span>
                ) : (
                  <Placa>{s.placa}</Placa>
                )}
              </td>
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
              {onExcluir && (
                <td className="num">
                  <button
                    type="button"
                    className="btn btn-pequeno btn-perigo"
                    disabled={ocupado}
                    onClick={() => onExcluir(s)}
                    aria-label={`Excluir sessão de ${s.placa} com entrada em ${dataHora(s.entrada)}`}
                  >
                    Excluir
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessoesGaragem({ garagens }) {
  const ativas = garagens.filter((g) => g.ativa);
  const [garagemId, setGaragemId] = useParamUrl('garagem');
  const [periodo] = useParamUrl('periodo', '7d');
  const [status, setStatus] = useParamUrl('status');
  const [mostrar, setMostrar] = useState(PAGINA);

  useEffect(() => {
    if (!garagemId && ativas.length) setGaragemId(ativas[0]._id);
  }, [ativas, garagemId, setGaragemId]);

  useEffect(() => setMostrar(PAGINA), [garagemId, periodo, status]);

  const p = PERIODOS.find((x) => x.id === periodo) || PERIODOS[1];
  const { dados, erro, carregando, recarregar } = useCarregar(() => {
    if (!garagemId) return Promise.resolve(null);
    const inicio = new Date(Date.now() - p.ms).toISOString();
    return api.sessoesGaragem(garagemId, { inicio, status });
  }, [garagemId, periodo, status]);
  const exclusao = useExcluirSessao(recarregar);

  const r = dados?.resumo;

  return (
    <div className="pilha">
      <Card titulo="Filtros" id="filtros">
        <div className="linha">
          <Campo label="Garagem">
            <SelectGaragem
              garagens={garagens}
              valor={garagemId}
              onChange={(v) => setGaragemId(v, { replace: false })}
              apenasAtivas={false}
            />
          </Campo>
          <div className="fixo campo">
            <span className="campo-label" id="rotulo-periodo">
              Período
            </span>
            <nav className="segmentado" aria-labelledby="rotulo-periodo">
              {PERIODOS.map((x) => (
                <a key={x.id} href={linkCom('periodo', x.id)} aria-current={x.id === p.id ? 'true' : undefined}>
                  {x.nome}
                </a>
              ))}
            </nav>
          </div>
          <div className="fixo" style={{ width: 170 }}>
            <Campo label="Status">
              <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="ABERTA">Abertas</option>
                <option value="FECHADA">Fechadas</option>
              </select>
            </Campo>
          </div>
        </div>
        {dados && (
          <p className="cassandra-info" role="status" aria-live="polite">
            <Badge cor="azul">
              <span translate="no">Cassandra</span>
            </Badge>
            {numero(dados.particoes_lidas)} partição(ões) <code translate="no">(garagem_id, dia)</code> lidas em
            paralelo · {dados.tempo_consulta_ms.toLocaleString(undefined, { maximumFractionDigits: 1 })}&nbsp;ms
          </p>
        )}
      </Card>

      <Alerta>{erro}</Alerta>
      {carregando && !dados && <Carregando texto="Consultando sessões…" />}

      {r && (
        <>
          <section className="metricas" aria-label="Resumo do período">
            <div className="metrica">
              <span>Faturamento</span>
              <strong>{brl(r.faturamento)}</strong>
            </div>
            <div className="metrica">
              <span>Sessões</span>
              <strong>{numero(r.total)}</strong>
              <small>
                {numero(r.abertas)} abertas · {numero(r.fechadas)} fechadas
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
                {numero(r.mensalistas)} / {numero(r.avulsos)}
              </strong>
              <small>{pct(r.total ? r.mensalistas / r.total : 0)} mensalistas</small>
            </div>
          </section>

          <Card titulo={`Faturamento por ${p.id === '24h' ? 'hora' : 'dia'}`} id="grafico">
            <Grafico sessoes={dados.sessoes} porHora={p.id === '24h'} inicio={dados.inicio} />
          </Card>

          <Card
            id="sessoes"
            titulo={`Sessões (${numero(Math.min(mostrar, dados.sessoes.length))} de ${numero(dados.sessoes.length)})`}
          >
            {dados.sessoes.length === 0 ? (
              <Vazio titulo="Nenhuma sessão no período">Escolha um período maior ou outra garagem.</Vazio>
            ) : (
              <>
                {exclusao.dialogo}
                <Alerta focar onFechar={exclusao.limparErro}>
                  {exclusao.erro}
                </Alerta>
                <SessoesTabela
                  sessoes={dados.sessoes.slice(0, mostrar)}
                  legenda="Sessões da garagem no período"
                  onExcluir={exclusao.excluir}
                  ocupado={exclusao.ocupado}
                />
                {mostrar < dados.sessoes.length && (
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button type="button" className="btn" onClick={() => setMostrar((m) => m + PAGINA)}>
                      Mostrar mais {numero(Math.min(PAGINA, dados.sessoes.length - mostrar))} sessões
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function HistoricoVeiculo() {
  const [placaUrl, setPlacaUrl] = useParamUrl('placa');
  const [placa, setPlaca] = useState(placaUrl);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => (placaUrl ? api.historicoVeiculo(placaUrl) : Promise.resolve(null)),
    [placaUrl],
  );
  const exclusao = useExcluirSessao(recarregar);

  return (
    <Card titulo="Histórico de um veículo" id="historico">
      <form
        className="linha"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPlacaUrl(placa, { replace: false });
        }}
      >
        <Campo label="Placa">
          <InputPlaca valor={placa} onChange={setPlaca} name="placa-historico" />
        </Campo>
        <div className="fixo" style={{ marginBottom: 14 }}>
          <BotaoEnviar ocupado={carregando && Boolean(placaUrl)} className="" textoOcupado="Buscando…">
            Buscar histórico
          </BotaoEnviar>
        </div>
      </form>
      <Alerta>{erro}</Alerta>
      {dados &&
        (dados.sessoes.length === 0 ? (
          <Vazio titulo={`Nenhuma sessão para ${dados.placa}`}>
            Confira a placa ou registre uma entrada na Operação.
          </Vazio>
        ) : (
          <>
            <p className="nota" style={{ marginBottom: 12 }}>
              {numero(dados.resumo.total)} sessão(ões) · total pago {brl(dados.resumo.faturamento)} · leitura de uma
              única partição (<code translate="no">placa</code>) já ordenada por entrada.
            </p>
            {exclusao.dialogo}
            <Alerta focar onFechar={exclusao.limparErro}>
              {exclusao.erro}
            </Alerta>
            <SessoesTabela
              sessoes={dados.sessoes}
              comGaragem
              legenda={`Histórico do veículo ${dados.placa}`}
              onExcluir={exclusao.excluir}
              ocupado={exclusao.ocupado}
            />
          </>
        ))}
    </Card>
  );
}

export default function Relatorios({ garagens }) {
  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Sessões lidas do Cassandra: uma partição por garagem e por dia, consultadas em paralelo."
      />
      <div className="pilha">
        <SessoesGaragem garagens={garagens} />
        <HistoricoVeiculo />
      </div>
    </>
  );
}
