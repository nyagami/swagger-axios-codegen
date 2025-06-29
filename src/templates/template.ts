import camelcase from 'camelcase'
import { IPropDef, ISwaggerOptions } from '../baseInterfaces'
import { isDefinedGenericTypes, toBaseType } from '../utils'

const baseTypes = ['string', 'number', 'object', 'boolean', 'any']
const isAdditionalProperties = (x: string) => x === "[additionalProperties: string]"
const isNotAdditionalProperties = (x: string) => !isAdditionalProperties(x)

/** 类模板 */
export function interfaceTemplate(
  name: string,
  props: IPropDef[],
  imports: string[],
  strictNullChecks: boolean = true,
  description: string,
) {
  if (isDefinedGenericTypes(name)) {
    // 已经定义过的interface不再生成
    return ''
  }
  // 所有的引用
  const importString = imports
    .map(imp => {
      return `import { ${imp} } from '../definitions/${imp}'\n`
    })
    .join('')

  return `
  ${importString}

  /** ${description} */
  export interface ${name} {

    ${props.map(p => classPropsTemplate(
    p.name,
    p.type,
    p.format,
    p.desc,
    (!strictNullChecks || !(p.validationModel as any)?.required) && !isAdditionalProperties(p.name),
    false,
    false
  )).join('')}
  }
  `
}

/** 类模板 */
export function classTemplate(
  name: string,
  props: IPropDef[],
  imports: string[],
  strictNullChecks: boolean = true,
  useClassTransformer: boolean,
  generateValidationModel: boolean,
  description: string
) {
  // 所有的引用
  const mappedImports = imports.map(imp => {
    return `import { ${imp} } from '../definitions/${imp}'\n`
  })

  if (useClassTransformer && imports.length > 0) {
    mappedImports.push(`import { Type, Transform, Expose } from 'class-transformer'\n`)
  }
  const importString = mappedImports.join('')

  return `
  ${importString}

  /** ${description} */
  export class ${name} {

    ${props
      .map(p =>
        classPropsTemplate(
          p.name,
          p.type,
          p.format,
          p.desc,
          !strictNullChecks || !(p.validationModel as any)?.required,
          useClassTransformer,
          p.isEnum || p.isType,
        )
      )
      .join('')}

    constructor(data: ${name}){
      Object.assign(this, data);
    }
    ${generateValidationModel ? classValidationModelTemplate(props) : ''}
  }
  `
}

/** 类属性模板 */
export function classPropsTemplate(
  filedName: string,
  type: string,
  format: string,
  description: string,
  canNull: boolean,
  useClassTransformer: boolean,
  isType: boolean
) {
  /**
   * eg:
   *   //description
   *   fieldName: type
   */
  type = toBaseType(type, format)
  if (isNotAdditionalProperties(filedName)) {
    filedName = `'${filedName}'`
  }
  if (useClassTransformer) {
    const decorators = classTransformTemplate(type, format, isType)

    return `
  /** ${description || ''} */
  ${decorators}
  ${filedName}${canNull ? '?' : ''}:${type};
  `
  } else {
    return `
  /** ${description || ''} */
  ${filedName}${canNull ? '?' : ''}:${type};
  `
  }
}

export function propValidationModelTemplate(filedName: string, validationModel: object) {
  /**
   * eg:
   *   fieldName: { required: true, maxLength: 50 }
   */
  return `'${filedName}':${JSON.stringify(validationModel)}`
}

export function classValidationModelTemplate(props: IPropDef[]) {
  /**
   * eg:
   *   public static validationModel = { .. }
   */
  return `
    public static validationModel = {
      ${props
      .filter(p => p.validationModel !== null)
      .map(p => propValidationModelTemplate(p.name, p.validationModel))
      .join(',\n')}
    }
  `
}

export function classTransformTemplate(type: string, format: string, isType: boolean) {
  const decorators: string[] = [`@Expose()`]
  const nonArrayType = type.replace('[', '').replace(']', '')
  /* ignore interfaces */
  if (baseTypes.indexOf(nonArrayType) < 0 && !isType) {
    decorators.push(`@Type(() => ${nonArrayType})`)
  }
  return decorators.join('\n')
}

/** 类属性模板 */
export function classConstructorTemplate(name: string) {
  return `this['${name}'] = data['${name}'];\n`
}

/** 枚举 */
export function enumTemplate(name: string, enumString: string, prefix?: string) {
  return `
  export enum ${name}{
    ${enumString}
  }
  `
}

export function typeTemplate(name: string, typeString: string, prefix?: string) {
  return `
  export type ${name} = ${typeString || '""'};
  `
}

interface IRequestSchema {
  summary: string
  parameters: string
  responseType: string
  method: string
  contentType: string
  path: string
  pathReplace: string
  parsedParameters: any
  formData: string
  requestBody: any
}

/** requestTemplate */
export function requestTemplate(name: string, requestSchema: IRequestSchema, options: ISwaggerOptions) {
  let {
    summary = '',
    parameters = '',
    responseType = '',
    method = '',
    contentType = 'multipart/form-data',
    path = '',
    pathReplace = '',
    parsedParameters = <any>{},
    requestBody = null,
  } = requestSchema
  const {  responseTypeWrapper } = options
  const { queryParameters = [], bodyParameter = [], headerParameters } = parsedParameters

  return `
/**
 * ${summary || ''}
 */
function ${camelcase(
    name
  )}(${parameters}):Promise<${responseTypeWrapper ? responseTypeWrapper(responseType) : responseType}> {
  let url = basePath+'${path}'
  ${pathReplace}
  const configs = getConfigs('${method}', '${contentType}', url, {})
  ${parsedParameters && headerParameters && headerParameters.length > 0
  ? `options.headers = {${headerParameters}, ...options.headers }`
  : ''}
  ${parsedParameters && queryParameters.length > 0 ? 'configs.params = {' + queryParameters.join(',') + '}' : ''}
  const data = ${parsedParameters && bodyParameter && bodyParameter.length > 0
        ?
        bodyParameter
        : !!requestBody
          ? 'params.body'
          : 'undefined'
      }

  return fetcher(
    {
      method: '${method}',
      url: url,
      data,
      params: configs.params
    },
    {
      displayError: ${options.showErrorRequests?.find((v) => v.path === path && v.method === method) ? 'true' : 'false'},
    }
  );
}`
}

/** serviceTemplate */
export function serviceTemplate(allRequestNames: string[], body: string, imports: string[] = null, fetcherImportPath: string = './Fetcher') {
  // add base imports
  let mappedImports = (imports && imports.length > 0) ? `import { ${imports.join(',')}, } from '../index.defs'\n` : ''
  const fetcherImports = `import { fetcher } from '${fetcherImportPath}'\n;`
  // }


  return `

  ${mappedImports}
  ${fetcherImports}
  ${body}
  export default {
    ${allRequestNames.join(',\n')}
  }
  `
}
