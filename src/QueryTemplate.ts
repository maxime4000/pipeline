import * as _ from "lodash"

export class QueryTemplate {
    static hydrate(query: object, resource: any): object {
        return _.mapValues(query, (o: string, key) => {
            if (QueryTemplate.isTemplated(o)) {
                if (!resource[o.substring(1)]) {
                    throw new Error(`Resource field ${o.substring(1)} not found`)
                } else {
                    return resource[o.substring(1)]
                }
            } else {
                return QueryTemplate.escape(o)
            }
        })
    }

    static getTemplatedParts(queryTemplate: object) {
        return _.pickBy(queryTemplate, (o) => QueryTemplate.isTemplated(o))
    }

    static getNonTemplatedParts(queryTemplate: object) {
        return _.pickBy(queryTemplate, (o) => !QueryTemplate.isTemplated(o))
    }

    static escape(value: any) {
        if (typeof value === "string" && value.substring(0, 2) === "\\:") {
            return value.substring(1)
        }

        return value
    }

    private static isTemplated(value: any) {
        return typeof value === "string" && value.substring(0, 1) === ":"
    }
}
