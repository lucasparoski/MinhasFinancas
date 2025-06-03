// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type'); // Este é o select: 'expense' ou 'income'
const transactionsList = document.getElementById('transactions');
const totalIncomeSpan = document.getElementById('total-income');
const totalExpenseSpan = document.getElementById('total-expense');
const currentBalanceSpan = document.getElementById('current-balance');
const monthSelect = document.getElementById('month-select'); // O ÚNICO seletor de mês

let allLoadedTransactions = []; // Armazena todas as transações carregadas para filtragem
let totalIncome = 0;
let totalExpense = 0;

// --- 3. FUNÇÕES AUXILIARES ---

// Função para formatar o valor como moeda
function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// Função para gerar um ID único para a transação
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Função para formatar 'MM/YYYY' para um nome de mês legível e para 'YYYY-MM' para ordenação
function formatMonthForDisplay(mmYyyyString) {
    if (!mmYyyyString || !mmYyyyString.includes('/')) return mmYyyyString;
    const [month, year] = mmYyyyString.split('/');
    const date = new Date(year, parseInt(month) - 1); // Mês é 0-indexado
    const options = { year: 'numeric', month: 'long' };
    return date.toLocaleDateString('pt-BR', options);
}

// Função para converter MM/YYYY para YYYY-MM para fácil comparação e ordenação
function convertMmYyyyToYyyyMm(mmYyyyString) {
    if (!mmYyyyString || !mmYyyyString.includes('/')) {
        return '';
    }
    const [month, year] = mmYyyyString.split('/');
    return `${year}-${month.padStart(2, '0')}`; // Garante MM com dois dígitos
}

// --- 4. FUNÇÕES DE OPERAÇÃO COM SHEETSDB ---

// Função para adicionar uma transação ao SheetsDB
async function addTransactionToSheetsDB(transactionData, type) {
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const bodyData = {};

    bodyData.descricao = transactionData.description;
    bodyData.timestamp = transactionData.timestamp;
    bodyData.id = transactionData.id;
    bodyData.mesReferencia = transactionData.mesReferencia; // Adiciona a coluna 'mesReferencia'

    if (type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
    } else {
        bodyData.valorSaida = transactionData.amount;
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao adicionar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação adicionada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição POST para SheetsDB:", error);
        alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        throw error;
    }
}

// Função para deletar uma transação do SheetsDB
async function deleteTransactionFromSheetsDB(id, type) {
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const deleteUrl = `${targetUrl}/id/${id}`; // SheetsDB deleta por ID na URL

    try {
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao deletar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação deletada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição DELETE para SheetsDB:", error);
        alert("Ocorreu um erro ao deletar a transação. Verifique o console.");
        throw error;
    }
}

// Função para buscar TODAS as transações do SheetsDB
async function getAllTransactionsFromSheetsDB() {
    let allTransactions = [];

    try {
        // Busca Receitas
        const incomeResponse = await fetch(RECEITAS_API_URL);
        if (!incomeResponse.ok) {
            const errorText = await incomeResponse.text();
            throw new Error(`Erro ao buscar receitas: ${incomeResponse.status} - ${errorText}`);
        }
        const incomeData = await incomeResponse.json();
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada),
            type: 'income',
            mesReferencia: item.mesReferencia, 
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(incomes);

        // Busca Despesas
        const expenseResponse = await fetch(DESPESAS_API_URL);
        if (!expenseResponse.ok) {
            const errorText = await expenseResponse.text();
            throw new Error(`Erro ao buscar despesas: ${expenseResponse.status} - ${errorText}`);
        }
        const expenseData = await expenseResponse.json();
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida),
            type: 'expense',
            mesReferencia: item.mesReferencia, 
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // Ordena todas as transações combinadas por mesReferencia (YYYY-MM) e depois por timestamp (mais recentes primeiro)
        allTransactions.sort((a, b) => {
            const mesAnoA = convertMmYyyyToYyyyMm(a.mesReferencia || ''); 
            const mesAnoB = convertMmYyyyToYyyyMm(b.mesReferencia || ''); 

            if (mesAnoA === mesAnoB) {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            return mesAnoB.localeCompare(mesAnoA); 
        });

        return allTransactions;

    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        alert("Ocorreu um erro ao carregar as transações. Verifique o console e a configuração do SheetsDB/Planilha.");
        return [];
    }
}


// --- 5. FUNÇÕES DE UI E CÁLCULOS ---

function addTransactionToDOM(transaction) {
    const listItem = document.createElement('li');
    listItem.classList.add(transaction.type);
    
    const sign = transaction.type === 'expense' ? '-' : '+';
    const amountClass = transaction.type === 'expense' ? 'negative' : 'positive';

    // Inclui o mês de referência na exibição
    listItem.innerHTML = `
        <span>${transaction.description} (${transaction.mesReferencia})</span> 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType);
            loadAndFilterTransactions(); // Recarrega e filtra após a deleção
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

function updateSummary(transactionsToSum) { // Recebe as transações a serem somadas (filtradas)
    totalIncome = 0;
    totalExpense = 0;

    transactionsToSum.forEach(transaction => {
        if (transaction.type === 'income') {
            totalIncome += transaction.amount;
        } else {
            totalExpense += transaction.amount;
        }
    });

    const balance = totalIncome - totalExpense;
    totalIncomeSpan.textContent = formatCurrency(totalIncome);
    totalExpenseSpan.textContent = formatCurrency(totalExpense);
    currentBalanceSpan.textContent = formatCurrency(balance);
    
    if (balance < 0) {
        currentBalanceSpan.classList.add('negative');
        currentBalanceSpan.classList.remove('positive');
    } else {
        currentBalanceSpan.classList.add('positive');
        currentBalanceSpan.classList.remove('negative');
    }
}

// Função para popular o ÚNICO seletor de mês
function populateMonthSelect(transactions) {
    const months = new Set(); 
    // Adiciona a opção de "Todos os Meses" como um mês válido para o conjunto
    months.add('all'); 
    
    // Adiciona os meses das transações existentes no formato 'YYYY-MM'
    transactions.forEach(t => {
        if (t.mesReferencia) { 
            months.add(convertMmYyyyToYyyyMm(t.mesReferencia)); 
        }
    });

    // Converte Set para Array e ordena em ordem decrescente (do mais novo para o mais antigo)
    const sortedMonths = Array.from(months).sort((a, b) => {
        if (a === 'all') return -1; // Garante que 'all' vem primeiro
        if (b === 'all') return 1;
        return b.localeCompare(a);
    });

    monthSelect.innerHTML = ''; // Limpa o seletor
    sortedMonths.forEach(monthValue => {
        const option = document.createElement('option');
        option.value = monthValue; 
        if (monthValue === 'all') {
            option.textContent = 'Todos os Meses';
        } else {
            option.textContent = formatMonthForDisplay(monthValue); // Exibe 'NomeDoMês/Ano'
        }
        monthSelect.appendChild(option);
    });

    // Tenta manter o mês selecionado se já houver um
    if (monthSelect.dataset.selectedMonth) {
        monthSelect.value = monthSelect.dataset.selectedMonth;
    }
    // Se nenhum mês foi selecionado ou não existe mais, tenta selecionar o mês atual automaticamente
    else {
        const currentMonth = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
        const currentMonthYyyyMm = convertMmYyyyToYyyyMm(currentMonth);
        if (monthSelect.querySelector(`option[value="${currentMonthYyyyMm}"]`)) {
            monthSelect.value = currentMonthYyyyMm;
        } else {
            monthSelect.value = 'all'; // Se o mês atual não tem transação, mostra todos.
        }
    }
}

// Função para carregar TODAS as transações e, em seguida, popular o seletor e aplicar o filtro
async function loadAndFilterTransactions() {
    allLoadedTransactions = await getAllTransactionsFromSheetsDB(); // Carrega TUDO

    const currentSelectedMonth = monthSelect.value; // Guarda o mês selecionado antes de repopular
    monthSelect.dataset.selectedMonth = currentSelectedMonth; // Guarda em um atributo de dados

    populateMonthSelect(allLoadedTransactions); // Popula o seletor de mês
    
    // Tenta restaurar a seleção após popular, ou define uma padrão
    if (monthSelect.dataset.selectedMonth && monthSelect.querySelector(`option[value="${monthSelect.dataset.selectedMonth}"]`)) {
        monthSelect.value = monthSelect.dataset.selectedMonth;
    } else {
        monthSelect.value = 'all'; // Default para "Todos os Meses" se nada for selecionado
    }

    filterTransactionsByMonth(); // Aplica o filtro com o mês selecionado
}

// Função para filtrar e exibir transações com base no mês selecionado
function filterTransactionsByMonth() {
    const selectedMonthValue = monthSelect.value; // Valor do único seletor (YYYY-MM ou 'all')
    let filteredTransactions = [];

    if (selectedMonthValue === 'all') {
        filteredTransactions = allLoadedTransactions; // Exibe tudo
        // console.log("Exibindo todas as transações.");
    } else {
        // Filtra transações onde 'mesReferencia' (no formato MM/YYYY) corresponde ao 'YYYY-MM' do filtro
        filteredTransactions = allLoadedTransactions.filter(t => 
            t.mesReferencia && convertMmYyyyToYyyyMm(t.mesReferencia) === selectedMonthValue
        );
        // console.log(`Filtrando para o mês: ${selectedMonthValue}, encontrado: ${filteredTransactions.length}`);
    }

    transactionsList.innerHTML = ''; // Limpa a lista exibida

    if (filteredTransactions.length === 0) {
        // console.log('Nenhuma transação encontrada para o mês selecionado.');
        updateSummary([]); // Atualiza o resumo com valores zero
        return;
    }

    // Ordena as transações filtradas por timestamp (mais recentes primeiro)
    filteredTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Adiciona as transações filtradas ao DOM
    filteredTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(filteredTransactions); // Atualiza o resumo APENAS com as transações filtradas
}

// --- 6. EVENT LISTENERS ---

// Listener para o evento de envio do formulário de transações
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const description = descriptionInput.value;
    const amount = parseFloat(amountInput.value);
    // Pega o mês de referência diretamente do ÚNICO seletor de mês (o que está sendo visualizado)
    const mesReferencia = monthSelect.value; 
    const type = typeInput.value; 

    // Se o mês selecionado for "Todos os Meses", não podemos adicionar a ele
    if (mesReferencia === 'all') {
        alert('Por favor, selecione um mês específico no filtro para adicionar a transação.');
        return;
    }

    if (description && amount && mesReferencia) {
        const newTransaction = {
            description,
            amount,
            type,
            mesReferencia, 
            timestamp: new Date().toISOString(), 
            id: generateUniqueId() 
        };

        try {
            await addTransactionToSheetsDB(newTransaction, type);
            console.log("Transação adicionada com sucesso no SheetsDB!");
            
            // Após adicionar, recarrega TUDO e filtra novamente (mantendo o mês selecionado)
            // A função loadAndFilterTransactions já cuida de restaurar o mês selecionado
            await loadAndFilterTransactions(); 

            // Limpa o formulário para a próxima entrada
            descriptionInput.value = '';
            amountInput.value = '';
            // O seletor de mês não precisa ser resetado, pois ele mantém o mês selecionado
            typeInput.value = 'expense'; 
        } catch (error) {
            console.error("Erro ao adicionar transação ao SheetsDB:", error);
            alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        }
    } else {
        alert('Por favor, preencha todos os campos (descrição, valor e mês).');
    }
});

// Listener para a mudança no ÚNICO seletor de mês
monthSelect.addEventListener('change', filterTransactionsByMonth);

// Carregar todas as transações e popular o seletor de meses ao iniciar a página
document.addEventListener('DOMContentLoaded', loadAndFilterTransactions);