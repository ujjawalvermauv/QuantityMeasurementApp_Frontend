import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../shared/api.service';
import { ConfigService } from '../../shared/config.service';
import { OperationType, Quantity } from '../../shared/models';

interface HistorySummary {
  type: string;
  operation: string;
  input: string;
  result: string;
}

interface HistoryView {
  id: string;
  type: string;
  operation: string;
  input: string;
  result: string;
  date: string;
  isError: boolean;
  errorMessage: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent implements OnInit {
  readonly arithmeticOperations = new Set<OperationType>(['add', 'subtract', 'divide']);

  categories: string[] = [];
  categoryUnits: string[] = [];

  operation: OperationType = 'convert';
  category = '';

  firstValue: number | null = null;
  firstUnit = '';

  secondValue: number | null = null;
  secondUnit = '';

  targetUnit = '';

  message = '';
  messageKind = '';

  running = false;
  resultHtml = 'No operation run yet.';

  historyHint = 'Login or signup to view your operation history.';
  historyItems: HistoryView[] = [];
  historyError = '';

  userBadgeText = '';

  private appConfig?: { categories: Record<string, string[]> };

  constructor(
    private readonly api: ApiService,
    private readonly configService: ConfigService,
  ) {}

  get isAuthenticated(): boolean {
    return Boolean(this.api.getToken() && this.api.getUser());
  }

  get needsSecond(): boolean {
    return this.operation !== 'convert';
  }

  get needsTarget(): boolean {
    return this.operation === 'convert' || this.operation === 'add' || this.operation === 'subtract';
  }

  get canUseArithmetic(): boolean {
    return this.category !== 'Temperature';
  }

  get operationOptions(): Array<{ value: OperationType; label: string; disabled: boolean }> {
    const isTemperature = this.category === 'Temperature';

    return [
      { value: 'convert', label: 'Convert Units', disabled: false },
      { value: 'compare', label: 'Compare Quantities', disabled: false },
      { value: 'add', label: 'Add Quantities', disabled: isTemperature },
      { value: 'subtract', label: 'Subtract Quantities', disabled: isTemperature },
      { value: 'divide', label: 'Divide Quantities', disabled: isTemperature },
    ];
  }

  async ngOnInit(): Promise<void> {
    await this.initializeDashboard();
  }

  private setMessage(text: string, kind = ''): void {
    this.message = text;
    this.messageKind = kind;
  }

  private setupAuthUI(): void {
    const authUser = this.api.getUser();
    if (this.isAuthenticated && authUser) {
      this.userBadgeText = `${authUser.name} | ${authUser.email}`;
      return;
    }

    this.userBadgeText = '';
  }

  private setCategoryUnits(): void {
    if (!this.appConfig) {
      this.categoryUnits = [];
      return;
    }

    this.categoryUnits = this.appConfig.categories[this.category] || [];

    if (!this.categoryUnits.includes(this.firstUnit)) {
      this.firstUnit = this.categoryUnits[0] || '';
    }

    if (!this.categoryUnits.includes(this.secondUnit)) {
      this.secondUnit = this.categoryUnits[0] || '';
    }

    if (!this.categoryUnits.includes(this.targetUnit)) {
      this.targetUnit = this.categoryUnits[0] || '';
    }
  }

  onCategoryChange(): void {
    this.setCategoryUnits();

    if (!this.canUseArithmetic && this.arithmeticOperations.has(this.operation)) {
      this.operation = 'convert';
      this.setMessage('Arithmetic operations are blocked for Temperature.', 'error');
    } else {
      this.setMessage('');
    }
  }

  onOperationChange(): void {
    if (!this.needsSecond) {
      this.secondValue = null;
    }
    this.setMessage('');
  }

  private parseNumber(value: number | null, label: string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${label} must be a valid number.`);
    }
    return numeric;
  }

  private buildQuantity(value: number | null, unit: string): Quantity {
    return {
      value: this.parseNumber(value, 'Quantity value'),
      unit,
      category: this.category,
    };
  }

  private formatUnit(unit: string): string {
    return String(unit || '').trim().toLowerCase();
  }

  private formatQuantity(quantity: any): string {
    if (!quantity) {
      return '';
    }

    const value = quantity.value ?? quantity.Value;
    const unit = quantity.unit ?? quantity.Unit;

    if (value === undefined || value === null || value === '') {
      return this.formatUnit(unit);
    }

    return `${value} ${this.formatUnit(unit)}`.trim();
  }

  private getOperationName(operation: string): string {
    return String(operation || '').trim().toLowerCase();
  }

  private getOperationSymbol(operation: string): string {
    switch (this.getOperationName(operation)) {
      case 'add':
        return '+';
      case 'subtract':
        return '-';
      case 'divide':
        return '/';
      default:
        return '->';
    }
  }

  private getBooleanResult(data: any): boolean | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    return Object.prototype.hasOwnProperty.call(data, 'booleanResult') ? data.booleanResult : data.BooleanResult;
  }

  private getSummaryText(operation: string, data: any): string {
    const op = this.getOperationName(operation);
    const first = data?.first || data?.First || data?.source || data?.Source;
    const second = data?.second || data?.Second;
    const resultQuantity = data?.quantityResult || data?.QuantityResult;
    const scalarResult = data?.scalarResult ?? data?.ScalarResult;
    const booleanResult = this.getBooleanResult(data);

    if (op === 'convert' && first && resultQuantity) {
      return `${this.formatQuantity(first)} ${this.getOperationSymbol(op)} ${this.formatQuantity(resultQuantity)}`;
    }

    if (op === 'compare' && first && second && typeof booleanResult === 'boolean') {
      return `${this.formatQuantity(first)} vs ${this.formatQuantity(second)} = ${String(booleanResult)}`;
    }

    if ((op === 'add' || op === 'subtract') && first && second && resultQuantity) {
      return `${this.formatQuantity(first)} ${this.getOperationSymbol(op)} ${this.formatQuantity(second)} = ${this.formatQuantity(resultQuantity)}`;
    }

    if (op === 'divide' && first && second && scalarResult !== undefined) {
      return `${this.formatQuantity(first)} ${this.getOperationSymbol(op)} ${this.formatQuantity(second)} = ${String(scalarResult)}`;
    }

    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }

    if (data && typeof data.Message === 'string' && data.Message.trim()) {
      return data.Message;
    }

    return 'Operation completed successfully.';
  }

  private renderResultHtml(operation: string, data: any): string {
    const op = this.getOperationName(operation);
    const source = data?.source || data?.Source || data?.First;
    const first = data?.first || data?.First || source;
    const second = data?.second || data?.Second;
    const quantityResult = data?.quantityResult || data?.QuantityResult;
    const scalarResult = data?.scalarResult ?? data?.ScalarResult;
    const booleanResult = this.getBooleanResult(data);

    const details: string[] = [];
    const addDetail = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      details.push(`<div class="result-detail-row"><span class="result-detail-label">${label}</span><span class="result-detail-value">${value}</span></div>`);
    };

    addDetail('Operation', op.toUpperCase());
    addDetail('Category', data?.first?.category || data?.First?.category || data?.First?.Category || this.category);
    if (first) {
      addDetail('Input', this.formatQuantity(first));
    }
    if (second) {
      addDetail('Second', this.formatQuantity(second));
    }
    if (quantityResult) {
      addDetail('Result', this.formatQuantity(quantityResult));
    }
    if (scalarResult !== undefined) {
      addDetail('Result', String(scalarResult));
    }
    if (typeof booleanResult === 'boolean') {
      addDetail('Result', String(booleanResult));
    }

    return `<div class="result-content"><p class="result-summary">${this.getSummaryText(operation, data)}</p><div class="result-details">${details.join('')}</div></div>`;
  }

  async runOperation(): Promise<void> {
    if (!this.canUseArithmetic && this.arithmeticOperations.has(this.operation)) {
      this.setMessage('Arithmetic operations are blocked for Temperature.', 'error');
      return;
    }

    const first: Quantity = {
      value: this.parseNumber(this.firstValue, 'First value'),
      unit: this.firstUnit,
      category: this.category,
    };

    try {
      this.setMessage('');
      this.running = true;
      this.resultHtml = '';

      let result: any;

      if (this.operation === 'convert') {
        result = await this.api.convert(first, this.targetUnit);
      }

      if (this.operation === 'compare') {
        const second = this.buildQuantity(this.secondValue, this.secondUnit);
        result = await this.api.compare(first, second);
      }

      if (this.operation === 'add') {
        const second = this.buildQuantity(this.secondValue, this.secondUnit);
        result = await this.api.add(first, second, this.targetUnit);
      }

      if (this.operation === 'subtract') {
        const second = this.buildQuantity(this.secondValue, this.secondUnit);
        result = await this.api.subtract(first, second, this.targetUnit);
      }

      if (this.operation === 'divide') {
        const second = this.buildQuantity(this.secondValue, this.secondUnit);
        result = await this.api.divide(first, second);
      }

      this.resultHtml = this.renderResultHtml(this.operation, result);
      this.setMessage(this.getSummaryText(this.operation, result), 'success');

      if (this.isAuthenticated) {
        await this.loadHistory();
      }
    } catch (error) {
      this.resultHtml = '';

      if (Number((error as { status?: number })?.status) === 401) {
        if (this.isAuthenticated) {
          this.setMessage('Your session expired or is invalid. Please login again.', 'error');
        } else {
          this.setMessage('Operation request was rejected by backend authorization settings.', 'error');
        }
        return;
      }

      this.setMessage((error as { message?: string })?.message || 'Operation failed. Please check your inputs.', 'error');
    } finally {
      this.running = false;
    }
  }

  private parseHistoryDescription(entry: any) {
    const description = String(entry?.description || entry?.Description || '').trim();
    if (!description) {
      return { operation: 'unknown', raw: '' } as any;
    }

    const segments = description
      .split('|')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const parsed: Record<string, string> = { raw: description };
    const plainSegments: string[] = [];

    segments.forEach((segment) => {
      const [key, ...valueParts] = segment.split('=');
      if (key && valueParts.length > 0) {
        parsed[key.trim().toUpperCase()] = valueParts.join('=').trim();
      } else {
        plainSegments.push(segment);
      }
    });

    const operationHint = parsed['OPERATION'] || plainSegments[0] || '';
    parsed['operation'] = this.getOperationName(operationHint);

    if (!parsed['operation'] || parsed['operation'] === 'unknown') {
      const known = plainSegments
        .map((segment) => this.getOperationName(segment))
        .find((segment) => ['convert', 'compare', 'add', 'subtract', 'divide'].includes(segment));

      if (known) {
        parsed['operation'] = known;
      }
    }

    return parsed;
  }

  private parseQuantityToken(token: string) {
    if (!token) {
      return { text: '', category: '' };
    }

    const fields = token
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .reduce((accumulator, pair) => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          accumulator[key.trim().toUpperCase()] = valueParts.join('=').trim();
        }
        return accumulator;
      }, {} as Record<string, string>);

    const value = fields['VAL'] || fields['VALUE'] || '';
    const unit = fields['UNIT'] || '';
    const category = fields['CAT'] || fields['CATEGORY'] || '';

    if (!value && !unit) {
      return { text: token.trim(), category: String(category).trim() };
    }

    return {
      text: [value, this.formatUnit(unit)].filter(Boolean).join(' ').trim(),
      category: String(category).trim(),
    };
  }

  private normalizeHistoryType(parsedEntry: Record<string, string>, fallbackCategory = ''): string {
    const rawType = parsedEntry['TYPE'] || parsedEntry['CATEGORY'] || parsedEntry['CAT'] || fallbackCategory || '';
    const normalized = String(rawType || '').trim().toLowerCase();

    if (!normalized) {
      return '-';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private formatOperationLabel(operation: string): string {
    const normalized = this.getOperationName(operation);
    if (!normalized) {
      return 'Unknown';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private cleanRawHistoryText(raw: string): string {
    return String(raw || '')
      .split('|')
      .map((segment) => segment.trim())
      .filter((segment) => segment && !segment.toUpperCase().startsWith('USER='))
      .join(' | ');
  }

  private buildHistorySummary(parsedEntry: Record<string, string>, entry: any): HistorySummary {
    switch (parsedEntry['operation']) {
      case 'convert': {
        const inputToken = this.parseQuantityToken(parsedEntry['SRC'] || parsedEntry['SOURCE'] || parsedEntry['FIRST']);
        const resultToken = this.parseQuantityToken(parsedEntry['RESULT']);
        const type = this.normalizeHistoryType(parsedEntry, inputToken.category);

        return {
          type,
          operation: 'Convert',
          input: inputToken.text || '-',
          result: resultToken.text || '-',
        };
      }
      case 'compare': {
        const first = this.parseQuantityToken(parsedEntry['FIRST']);
        const second = this.parseQuantityToken(parsedEntry['SECOND']);
        const rawResult = String(parsedEntry['RESULT'] || '').trim().toLowerCase();
        const normalizedResult = rawResult === 'true' || rawResult === 'equal' ? 'Equal' : 'Not Equal';

        return {
          type: this.normalizeHistoryType(parsedEntry, first.category || second.category),
          operation: 'Compare',
          input: [first.text, second.text].filter(Boolean).join(' vs ') || '-',
          result: normalizedResult,
        };
      }
      case 'add':
      case 'subtract': {
        const first = this.parseQuantityToken(parsedEntry['FIRST']);
        const second = this.parseQuantityToken(parsedEntry['SECOND']);
        const result = this.parseQuantityToken(parsedEntry['RESULT']);

        return {
          type: this.normalizeHistoryType(parsedEntry, first.category || second.category),
          operation: this.formatOperationLabel(parsedEntry['operation']),
          input:
            [first.text, second.text]
              .filter(Boolean)
              .join(parsedEntry['operation'] === 'add' ? ' + ' : ' - ') || '-',
          result: result.text || '-',
        };
      }
      case 'divide': {
        const first = this.parseQuantityToken(parsedEntry['FIRST']);
        const second = this.parseQuantityToken(parsedEntry['SECOND']);
        const result = parsedEntry['RESULT'] || '-';

        return {
          type: this.normalizeHistoryType(parsedEntry, first.category || second.category),
          operation: 'Divide',
          input: [first.text, second.text].filter(Boolean).join(' / ') || '-',
          result: String(result),
        };
      }
      default: {
        const fallbackText = this.cleanRawHistoryText(parsedEntry['raw'] || '');

        return {
          type: this.normalizeHistoryType(parsedEntry, entry?.category || entry?.Category),
          operation: this.formatOperationLabel(parsedEntry['operation']),
          input: fallbackText || '-',
          result: parsedEntry['ERRORMESSAGE'] || '-',
        };
      }
    }
  }

  private formatHistoryDate(rawDate: unknown): string {
    if (!rawDate) {
      return '-';
    }

    let normalizedValue = rawDate;
    if (typeof normalizedValue === 'string' && /T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalizedValue)) {
      normalizedValue = `${normalizedValue}Z`;
    }

    const date = new Date(normalizedValue as string);
    if (!Number.isFinite(date.getTime())) {
      return String(rawDate);
    }

    const formatted = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(date);

    return formatted.replace('AM', 'am').replace('PM', 'pm');
  }

  async loadHistory(): Promise<void> {
    this.historyError = '';
    this.historyItems = [];

    if (!this.isAuthenticated) {
      this.historyHint = 'Login or signup to view your operation history.';
      return;
    }

    try {
      const entries = await this.api.history();
      this.historyHint = 'Recent operations from your account.';

      if (!Array.isArray(entries) || entries.length === 0) {
        this.historyItems = [];
        return;
      }

      this.historyItems = entries.map((entry: any, index: number) => {
        const parsed = this.parseHistoryDescription(entry);
        const summary = this.buildHistorySummary(parsed, entry);
        const isError = Boolean(entry?.isError ?? entry?.IsError);
        const errorMessage = String(entry?.errorMessage ?? entry?.ErrorMessage ?? '').trim();

        const rawId = entry?.historyId ?? entry?.HistoryId ?? entry?.id ?? entry?.Id;
        const numericId = Number(rawId);
        const displayId = Number.isFinite(numericId) ? numericId : 1104 + index;

        return {
          id: String(displayId),
          type: summary.type || '-',
          operation: summary.operation || 'Unknown',
          input: summary.input,
          result: summary.result,
          date: this.formatHistoryDate(entry.createdAt || entry.CreatedAt),
          isError,
          errorMessage,
        } satisfies HistoryView;
      });
    } catch (error) {
      this.historyError = (error as { message?: string })?.message || 'Unable to load history.';
    }
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.setupAuthUI();
    await this.loadHistory();
  }

  private async initializeDashboard(): Promise<void> {
    this.setupAuthUI();
    const appConfig = await this.configService.loadAppConfig();
    this.appConfig = { categories: appConfig.categories || {} };

    this.categories = Object.keys(this.appConfig.categories);
    this.category = this.categories[0] || '';
    this.setCategoryUnits();

    await this.loadHistory();
  }
}
