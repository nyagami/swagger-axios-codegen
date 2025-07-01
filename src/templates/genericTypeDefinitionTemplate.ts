export function universalGenericTypeDefinition() {
  return `
    export interface IList<T> extends Array<T>{}
    export interface List<T> extends Array<T>{}
    export interface IDictionary<TValue>{
      [key: string]: TValue
    }
    export interface Dictionary<TValue> extends IDictionary<TValue>{
    
    }
  `;
}

export function abpGenericTypeDefinition() {
  return `
  `
}


