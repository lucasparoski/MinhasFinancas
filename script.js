// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const monthInput = document.getElementById('month-input'); // Novo input de mês (MM/YYYY)
const typeInput = document.getElementById('type'); // Este é o select: 'expense' ou 'income'
const transactionsList = document.getElementById('transactions');
const totalIncomeSpan = document.getElementById('total-income');
const totalExpenseSpan = document.getElementById('total-expense');
const currentBalanceSpan = document.getElementById('current-balance');
const monthSelect = document.getElementById('month-select'); // Seletor de mês para filtro

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

// Função para obter o nome do mês a partir de uma string 'YYYY-MM' ou 'MM/YYYY'
function formatMonthForDisplay(monthYearString) {
    let year, month;
    if (monthYearString.includes('-')) { // Formato YYYY-MM
        [year, month] = monthYearString.split('-');
    } else if (monthYearString.includes('/')) { // Formato MM/YYYY
        [month, year] = monthYearString.split('/');
    } else {
        return monthYearString; // Retorna como está se não for um formato esperado
    }

    const date = new Date(year, month - 1); // Mês é 0-indexado em JavaScript
    const options = { year: 'numeric', month: 'long' };
    return date.toLocaleDateString('pt-BR', options);
}

// Função para converter MM/YYYY para YYYY-MM para fácil comparação e ordenação
function convertMmYyyyToYyyyMm(mmYyyyString) {
    if (!mmYyyyString || !mmYyyyString.includes('/')) {
        return ''; // Retorna vazio ou trata erro
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
    bodyData.mesReferencia = transactionData.mesReferencia; // Adiciona a nova coluna 'mesReferencia'

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
    const deleteUrl = `${targetUrl}/id/${id}`;

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

// Função para buscar todas as transações do SheetsDB
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
            mesReferencia: item.mesReferencia, // Nova propriedade 'mesReferencia'
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
            mesReferencia: item.mesReferencia, // Nova propriedade 'mesReferencia'
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // Ordena todas as transações combinadas por mesReferencia (YYYY-MM) e depois por timestamp (mais recentes primeiro)
        allTransactions.sort((a, b) => {
            const mesAnoA = convertMmYyyyToYyyyMm(a.mesReferencia || ''); // Converte para YYYY-MM
            const mesAnoB = convertMmYyyyToYyyyMm(b.mesReferencia || ''); // Converte para YYYY-MM

            if (mesAnoA === mesAnoB) {
                // Se o mês e ano forem os mesmos, ordena por timestamp
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            return mesAnoB.localeCompare(mesAnoA); // Ordena por YYYY-MM decrescente
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
        <span>${transaction.description} (${formatMonthForDisplay(transaction.mesReferencia)})</span> 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    // Atualiza os totais (somente para o mês filtrado atualmente)
    if (transaction.type === 'income') {
        totalIncome += transaction.amount;
    } else {
        totalExpense += transaction.amount;
    }
    updateSummary();

    // Adiciona listener para o botão de deletar no DOM
    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType);
            loadAndFilterTransactions(); // Recarrega todas as transações e as filtra novamente
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

function updateSummary() {
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

// Função para popular o seletor de meses
function populateMonthSelect(transactions) {
    const months = new Set(); // Usa Set para garantir meses únicos (ex: '2025-06')
    transactions.forEach(t => {
        if (t.mesReferencia) { 
            months.add(convertMmYyyyToYyyyMm(t.mesReferencia)); // Adiciona no formato YYYY-MM para consistência
        }
    });

    // Converte Set para Array e ordena em ordem decrescente (do mais novo para o mais antigo)
    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));

    monthSelect.innerHTML = '<option value="all">Todos os Meses</option>'; // Opção padrão
    sortedMonths.forEach(monthYyyyMm => {
        const option = document.createElement('option');
        option.value = monthYyyyMm; // Valor da opção será YYYY-MM
        // Formata para exibição como 'NomeDoMês YYYY'
        const [year, month] = monthYyyyMm.split('-');
        const dateForFormat = new Date(year, parseInt(month) - 1);
        option.textContent = dateForFormat.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
        
        monthSelect.appendChild(option);
    });

    // Tenta manter o mês selecionado se já houver um
    if (monthSelect.dataset.selectedMonth) {
        monthSelect.value = monthSelect.dataset.selectedMonth;
    }
}

// Função para carregar TODAS as transações e, em seguida, filtrar e exibir
async function loadAndFilterTransactions() {
    allLoadedTransactions = await getAllTransactionsFromSheetsDB(); // Carrega TUDO do SheetsDB
    
    // Armazena o mês atualmente selecionado para tentar restaurá-lo após a recarga
    const currentSelectedMonth = monthSelect.value;
    monthSelect.dataset.selectedMonth = currentSelectedMonth; 

    populateMonthSelect(allLoadedTransactions); // Popula o seletor de meses com base em TUDO

    // Se havia um mês selecionado antes de recarregar, tente selecioná-lo novamente
    if (monthSelect.dataset.selectedMonth) {
        monthSelect.value = monthSelect.dataset.selectedMonth;
    }

    filterTransactionsByMonth(); // Chama a função de filtragem inicial (ou para o mês selecionado)
}

// Função para filtrar e exibir transações com base no mês selecionado
function filterTransactionsByMonth() {
    const selectedMonthYyyyMm = monthSelect.value; // Valor do select é YYYY-MM
    let filteredTransactions = [];

    if (selectedMonthYyyyMm === 'all') {
        filteredTransactions = allLoadedTransactions;
    } else {
        // Filtra transações onde 'mesReferencia' (no formato MM/YYYY) corresponde a 'YYYY-MM' do select
        filteredTransactions = allLoadedTransactions.filter(t => 
            t.mesReferencia && convertMmYyyyToYyyyMm(t.mesReferencia) === selectedMonthYyyyMm
        );
    }

    // Reseta a lista e os totais para o novo cálculo
    transactionsList.innerHTML = '';
    totalIncome = 0;
    totalExpense = 0;

    if (filteredTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para o mês selecionado.');
        updateSummary();
        return;
    }

    // Ordena as transações filtradas por data e timestamp antes de exibir (mais recentes primeiro)
    filteredTransactions.sort((a, b) => {
        const dateTimeA = new Date(a.timestamp); // Timestamp já é ISO, direto para Date
        const dateTimeB = new Date(b.timestamp);
        return dateTimeB - dateTimeA;
    });

    // Adiciona as transações filtradas ao DOM
    filteredTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(); // Garante que o resumo é atualizado para o mês filtrado
}

// --- 6. EVENT LISTENERS ---

// Listener para o evento de envio do formulário de transações
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const description = descriptionInput.value;
    const amount = parseFloat(amountInput.value);
    const mesReferencia = monthInput.value; // Pega o mês de referência do novo input (MM/YYYY)
    const type = typeInput.value; 

    // Valida se descrição, valor e mês de referência foram preenchidos
    if (description && amount && mesReferencia) {
        // Formato para enviar para SheetsDB é MM/YYYY
        const newTransaction = {
            description,
            amount,
            type,
            mesReferencia, // Inclui a nova propriedade 'mesReferencia'
            timestamp: new Date().toISOString(), // Gera um timestamp no formato ISO 8601
            id: generateUniqueId() // Gera um ID único para esta transação
        };

        try {
            await addTransactionToSheetsDB(newTransaction, type);
            console.log("Transação adicionada com sucesso no SheetsDB!");
            
            // Após adicionar, recarrega TUDO e filtra novamente (mantendo o mês selecionado)
            await loadAndFilterTransactions(); 

            // Limpa o formulário para a próxima entrada
            descriptionInput.value = '';
            amountInput.value = '';
            monthInput.value = ''; // Limpa o campo de mês
            typeInput.value = 'expense'; // Reseta o tipo para 'Despesa'
        } catch (error) {
            console.error("Erro ao adicionar transação ao SheetsDB:", error);
            alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        }
    } else {
        alert('Por favor, preencha todos os campos (descrição, valor e mês).');
    }
});

// Listener para a mudança no seletor de mês
monthSelect.addEventListener('change', filterTransactionsByMonth);

// Carregar todas as transações e popular o seletor de meses ao iniciar a página
document.addEventListener('DOMContentLoaded', loadAndFilterTransactions);