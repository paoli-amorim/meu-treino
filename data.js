'use strict';
/* Plano inicial — "Plano de retorno aos treinos", Semana 1 */

const PROGRESSION = [
  'Aprender os movimentos e observar a recuperação.',
  'Manter séries e repetições; acrescentar uma quarta manhã de cardio, se estiver recuperado.',
  'Progredir repetições e experimentar intervalos moderados em uma manhã.',
  'Consolidar a execução; aumentar cargas apenas nos exercícios bem tolerados.',
  'Avaliar a entrada do HIIT e de uma terceira série nos exercícios principais.',
  'Considerar uma segunda sessão semanal de intervalos, conforme recuperação.',
  'Fazer pequenos avanços de carga ou volume, sem aumentar tudo ao mesmo tempo.',
  'Reavaliar peso, cintura, força, condicionamento e dor.'
];

const GUIDE = {
  rules: [
    'Faça os movimentos de forma controlada, soltando o ar durante o esforço.',
    'Se a técnica começar a se perder antes de completar as repetições, encerre a série e reduza a carga.',
    'Se algum exercício provocar ou aumentar a dor nas costas, interrompa e avise seu treinador para ajustar.',
    'Não compense treino perdido dobrando o treino seguinte.',
    'Só avance quando a etapa atual estiver confortável. Repetir uma semana faz parte do processo.'
  ],
  reading: '2 × 10 significa duas séries de dez repetições. O descanso indicado é entre as séries. Nos exercícios por lado, complete a quantidade indicada em cada lado.',
  tracking: [
    'Pese-se em três manhãs por semana, após ir ao banheiro e antes de comer, usando a mesma balança. Compare a média semanal, não uma pesagem isolada.',
    'Meça a cintura a cada duas semanas, sempre no mesmo ponto e nas mesmas condições.',
    'Anote as cargas e como as costas se comportaram durante o treino e no dia seguinte.'
  ],
  schedule: 'Deixe várias horas entre o cardio e a musculação. As semanas alternam a ordem A-B-A e B-A-B.'
};

function ex(id, name, sets, reps, perSide, rest, notes) {
  return { id, name, sets, reps, perSide, rest, notes, video: '' };
}

function defaultWorkouts() {
  const warmup = '5 minutos de bicicleta ou caminhada leve. Depois, 1 série preparatória de 10 repetições com carga bem leve nos dois primeiros exercícios.';
  const tip = 'Escolha uma carga que permita terminar sentindo que ainda faria mais 4 repetições com boa técnica. Não chegue à falha nesta fase.';
  return [
    {
      id: 'A', name: 'Treino A', type: 'strength', warmup, tip,
      exercises: [
        ex('a1', 'Leg press 45°', 2, 10, false, 120, 'Apoie costas e quadril no encosto. Posicione os pés aproximadamente na largura dos ombros. Desça sem deixar a pelve enrolar ou sair do apoio; empurre sem travar os joelhos.'),
        ex('a2', 'Puxada alta pela frente', 2, 10, false, 90, 'Mantenha os pés apoiados e o tronco estável. Puxe a barra à frente, em direção à parte alta do peito, sem jogar o corpo para trás. Retorne devagar.'),
        ex('a3', 'Flexão na parede', 2, 10, false, 90, 'Apoie as mãos na parede, um pouco além da largura dos ombros. Afaste os pés e mantenha o corpo alinhado. Aproxime o peito da parede e empurre, sem deixar a lombar afundar.'),
        ex('a4', 'Cadeira flexora', 2, 12, false, 90, 'Ajuste o aparelho para alinhar o joelho ao eixo da máquina. Mantenha quadril e costas apoiados. Dobre os joelhos e retorne lentamente, sem bater os pesos.'),
        ex('a5', 'Elevação lateral com halteres', 2, 12, false, 60, 'Com os cotovelos levemente dobrados, eleve os braços até uma altura confortável, no máximo próxima à dos ombros. Desça devagar, sem balanço ou encolher os ombros.'),
        ex('a6', 'Pallof press no crossover', 2, 8, true, 60, 'Ajuste a polia à altura do peito e fique de lado para ela. Segure o puxador junto ao peito, estenda os braços e sustente por 2 segundos, impedindo que o tronco gire. Retorne.')
      ]
    },
    {
      id: 'B', name: 'Treino B', type: 'strength', warmup, tip,
      exercises: [
        ex('b1', 'Agachamento até assento firme', 2, 10, false, 120, 'Use um assento estável, sem rodas. Com os pés aproximadamente na largura dos ombros, leve o quadril para trás e toque o assento sem se jogar. Levante empurrando o chão. Comece sem peso.'),
        ex('b2', 'Remada no crossover', 2, 10, false, 90, 'Ajuste a polia à altura do peito. Com os joelhos levemente flexionados e o tronco estável, puxe o acessório em direção às costelas. Retorne sem arredondar as costas ou balançar o corpo.'),
        ex('b3', 'Flexão na parede', 2, 10, false, 90, 'Mantenha o corpo alinhado. Dobre os cotovelos para aproximar o peito da parede e empurre para voltar. Não prenda a respiração.'),
        ex('b4', 'Cadeira extensora', 2, 12, false, 90, 'Alinhe os joelhos ao eixo da máquina e posicione o apoio acima dos tornozelos. Estenda os joelhos sem dar trancos e retorne devagar, mantendo o quadril apoiado.'),
        ex('b5', 'Ponte de glúteos no solo', 2, 10, false, 60, 'Deite de barriga para cima, dobre os joelhos e apoie os pés no chão. Contraia os glúteos e eleve o quadril sem arquear a lombar. Sustente por 2 segundos e desça devagar.'),
        ex('b6', 'Bird dog', 2, 5, true, 60, 'Em quatro apoios, estenda lentamente um braço e a perna oposta, sem girar o quadril ou arquear as costas. Sustente por 3 segundos, volte e alterne. Se necessário, mova só um membro por vez.')
      ]
    },
    {
      id: 'cardio', name: 'Cardio 20 min', type: 'cardio',
      options: ['Bicicleta', 'Elíptico', 'Esteira (caminhada)'],
      notes: 'Sem tiros ou esforço máximo. Escolha o aparelho mais confortável para suas costas. Não precisa treinar em jejum: o melhor horário é aquele que você consegue manter.',
      phases: [
        { name: 'Aquecimento', min: 5, desc: 'Comece devagar e aumente o ritmo gradualmente.' },
        { name: 'Parte principal', min: 10, desc: 'Esforço leve a moderado, conseguindo conversar em frases completas.' },
        { name: 'Desaceleração', min: 5, desc: 'Reduza o ritmo aos poucos até terminar confortável.' }
      ]
    }
  ];
}
