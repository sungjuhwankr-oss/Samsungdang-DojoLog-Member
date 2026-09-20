export function openTrainingDatabase(factory?: IDBFactory): Promise<IDBDatabase>;
export function upgradeTrainingDatabase(request: IDBOpenDBRequest, oldVersion: number): void;
export function requestResult<T>(request: IDBRequest<T>): Promise<T>;
export function transactionDone(transaction: IDBTransaction): Promise<void>;
