import * as _ from "lodash";
import * as util from "util";
import { SchemaBuilder, DeepPartialObject } from "@serafin/schema-builder";
import { notImplementedError, error } from "./error";
import { final } from "./FinalDecorator";
import { IdentityInterface } from "./IdentityInterface";
import { PIPELINE, PipeAbstract } from "./PipeAbstract";
import { SchemaBuildersInterface } from "./SchemaBuildersInterface";
import { PipeInterface } from "./PipeInterface";
import { Relation } from "./Relation";
import { ResultsInterface } from "./ResultsInterface";

export type PipelineMethods = "create" | "read" | "replace" | "patch" | "delete";

export abstract class PipelineAbstract<M extends IdentityInterface, S extends SchemaBuildersInterface = ReturnType<PipelineAbstract<M, null>["defaultSchema"]>,
    R extends { [key: string]: Relation } = {}> {
    public relations: R = {} as any;
    public static CRUDMethods: PipelineMethods[] = ['create', 'read', 'replace', 'patch', 'delete'];
    public schemaBuilders: S;

    private pipes: PipeInterface[] = []

    constructor(modelSchemaBuilder: SchemaBuilder<M>) {
        this.schemaBuilders = this.defaultSchema(modelSchemaBuilder) as any;
    }

    /**
     * For 'schemaBuilder' property redefinition in an extended class. Callable through 'super.getSchemaBuilders()'.
     */
    protected getSchemaBuilders(): S {
        return this.schemaBuilders;
    }

    public get modelSchemaBuilder(): SchemaBuilder<M> {
        return this.schemaBuilders.model as any
    }

    protected defaultSchema(modelSchemaBuilder: SchemaBuilder<M>): {
        model: SchemaBuilder<M>;
        createValues: SchemaBuilder<{ [P in keyof (Partial<Pick<M, "id">> & Pick<M, Exclude<keyof M, "id">>)]: (Partial<Pick<M, "id">> & Pick<M, Exclude<keyof M, "id">>)[P]; }>;
        createOptions: SchemaBuilder<{}>;
        createMeta: SchemaBuilder<{}>;
        readQuery: SchemaBuilder<{ [P in keyof M | Exclude<keyof M, keyof M>]?: { [P in keyof M | Exclude<keyof M, keyof M>]: (Pick<M, Exclude<keyof M, keyof M>> & { [P in keyof M]: M[P] extends any[] ? M[P] : M[P] | M[P][]; })[P]; }[P]; }>;
        readOptions: SchemaBuilder<{}>;
        readMeta: SchemaBuilder<{}>;
        replaceValues: SchemaBuilder<{ [P in keyof Pick<M, Exclude<keyof M, "id">>]: Pick<M, Exclude<keyof M, "id">>[P]; }>;
        replaceOptions: SchemaBuilder<{}>;
        replaceMeta: SchemaBuilder<{}>;
        patchQuery: SchemaBuilder<{
            id: M["id"] extends any[] ? M["id"] : M["id"] | M["id"][];
        }>;
        patchValues: SchemaBuilder<DeepPartialObject<{ [P in Exclude<keyof M, "id">]: Pick<M, Exclude<keyof M, "id">>[P]; }>>;
        patchOptions: SchemaBuilder<{}>;
        patchMeta: SchemaBuilder<{}>;
        deleteQuery: SchemaBuilder<{
            id: M["id"] extends any[] ? M["id"] : M["id"] | M["id"][];
        }>;
        deleteOptions: SchemaBuilder<{}>;
        deleteMeta: SchemaBuilder<{}>;
    } {
        return {
            model: modelSchemaBuilder,
            createValues: modelSchemaBuilder.setOptionalProperties(["id"]),
            createOptions: SchemaBuilder.emptySchema(),
            createMeta: SchemaBuilder.emptySchema(),
            readQuery: modelSchemaBuilder.transformPropertiesToArray().toOptionals(),
            readOptions: SchemaBuilder.emptySchema(),
            readMeta: SchemaBuilder.emptySchema(),
            replaceValues: modelSchemaBuilder.omitProperties(["id"]),
            replaceOptions: SchemaBuilder.emptySchema(),
            replaceMeta: SchemaBuilder.emptySchema(),
            patchQuery: modelSchemaBuilder.pickProperties(["id"]).transformPropertiesToArray(),
            patchValues: modelSchemaBuilder.omitProperties(["id"]).toDeepOptionals().toNullable(),
            patchOptions: SchemaBuilder.emptySchema(),
            patchMeta: SchemaBuilder.emptySchema(),
            deleteQuery: modelSchemaBuilder.pickProperties(["id"]).transformPropertiesToArray(),
            deleteOptions: SchemaBuilder.emptySchema(),
            deleteMeta: SchemaBuilder.emptySchema(),
        }
    }

    public pipe<MODEL extends IdentityInterface = this["schemaBuilders"]["model"]["T"],
        CV = this["schemaBuilders"]["createValues"]["T"],
        CO = this["schemaBuilders"]["createOptions"]["T"],
        CM = this["schemaBuilders"]["createMeta"]["T"],
        RQ = this["schemaBuilders"]["readQuery"]["T"],
        RO = this["schemaBuilders"]["readOptions"]["T"],
        RM = this["schemaBuilders"]["readMeta"]["T"],
        UV = this["schemaBuilders"]["replaceValues"]["T"],
        UO = this["schemaBuilders"]["replaceOptions"]["T"],
        UM = this["schemaBuilders"]["replaceMeta"]["T"],
        PQ = this["schemaBuilders"]["patchQuery"]["T"],
        PV = this["schemaBuilders"]["patchValues"]["T"],
        PO = this["schemaBuilders"]["patchOptions"]["T"],
        PM = this["schemaBuilders"]["patchMeta"]["T"],
        DQ = this["schemaBuilders"]["deleteQuery"]["T"],
        DO = this["schemaBuilders"]["deleteOptions"]["T"],
        DM = this["schemaBuilders"]["deleteMeta"]["T"],
        PR = {}>
        (pipe: PipeInterface<this["schemaBuilders"], MODEL, CV, CO, CM, RQ, RO, RM, UV, UO, UM, PQ, PV, PO, PM, DQ, DO, DM, PR>) {

        // Pipeline association
        if (pipe[PIPELINE]) {
            throw Error("Pipe already associated to a pipeline");
        }
        pipe[PIPELINE] = this;

        // SchemaBuilders modification
        _.forEach(this.schemaBuilders, (value, key) => {
            let schemaBuilderResolver = pipe["schemaBuilder" + _.upperFirst(key)];

            if (typeof schemaBuilderResolver == 'function') {
                this.schemaBuilders[key] = schemaBuilderResolver(this.schemaBuilders[key]);
            }
        });

        // add pipe to the pipeline if it implements at least one of the CRUD methods
        if ("read" in pipe || "create" in pipe || "replace" in pipe || "patch" in pipe || "delete" in pipe) {
            this.pipes.unshift(pipe)
        }

        return this as any as PipelineAbstract<MODEL, SchemaBuildersInterface<MODEL, CV, CO, CM, RQ, RO, RM, UV, UO, UM, PQ, PV, PO, PM, DQ, DO, DM>, R & PR>;
    }

    /**
     * Build a recursive function that will call all the pipes for a CRUD method
     */
    private pipeChain(method: PipelineMethods) {
        var i = 0;
        const callChain = async (...args) => {
            while (i < this.pipes.length && !(method in this.pipes[i])) { ++i }
            if (i >= this.pipes.length) {
                return this[`_${method}`](...args)
            } else {
                return (this.pipes[i++] as any)[method](callChain, ...args)
            }
        }
        return callChain
    }

    /**
     * Add a relation to the pipeline.
     * This method modifies the pipeline and affect the templated type.
     *
     * @param relation
     */
    public addRelation<NameKey extends keyof any, RelationModel extends IdentityInterface, RelationReadQuery, RelationReadOptions, RelationReadMeta,
        QueryKeys extends keyof RelationReadQuery = null, OptionsKeys extends keyof RelationReadOptions = null>
        (name: NameKey, pipeline: () => PipelineAbstract<RelationModel, SchemaBuildersInterface<RelationModel, {}, {}, {}, RelationReadQuery, RelationReadOptions, RelationReadMeta>, any>,
            query: { [key in QueryKeys]: any }, options?: { [key in OptionsKeys]: any }) {

        this.relations[name as string] = new Relation(this as any, name, pipeline, query, options)
        return this as any as PipelineAbstract<M, S, R & { [key in NameKey]: Relation<M, NameKey, RelationModel, RelationReadQuery, RelationReadOptions, RelationReadMeta, QueryKeys, OptionsKeys> }>;
    }

    /**
     * Get a readable description of what this pipeline does
     */
    toString(): string {
        return (util.inspect(_.mapValues(this.schemaBuilders, (schema: SchemaBuilder<any>) => schema.schema), false, null));
    }

    /**
     * Create new resources based on `resources` input array.
     *
     * @param resources An array of partial resources to be created
     * @param options Map of options to be used by pipelines
     */
    @final async create(resources: this["schemaBuilders"]["createValues"]["T"][], options?: this["schemaBuilders"]["createOptions"]["T"])
        : Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["createMeta"]["T"]>> {
        resources = _.cloneDeep(resources)
        options = _.cloneDeep(options)
        this.handleValidate('create', () => {
            this.schemaBuilders.createValues.validateList(resources);
            this.schemaBuilders.createOptions.validate(options || {} as any);
        });

        return this.pipeChain("create")(resources, options)
    }

    protected _create(resources, options): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["createMeta"]["T"]>> {
        throw notImplementedError("create", Object.getPrototypeOf(this).constructor.name);
    }

    /**
     * Read resources from the underlying source according to the given `query` and `options`.
     *
     * @param query The query filter to be used for fetching the data
     * @param options Map of options to be used by pipelines
     */
    @final async read(query?: this["schemaBuilders"]["readQuery"]["T"], options?: this["schemaBuilders"]["readOptions"]["T"])
        : Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["readMeta"]["T"]>> {
        query = _.cloneDeep(query)
        options = _.cloneDeep(options)
        this.handleValidate('read', () => {
            this.schemaBuilders.readQuery.validate(query || {});
            this.schemaBuilders.readOptions.validate(options || {});
        });

        return this.pipeChain("read")(query, options)
    }

    protected _read(query, options): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["readMeta"]["T"]>> {
        throw notImplementedError("read", Object.getPrototypeOf(this).constructor.name);
    }

    /**
     * Replace replaces an existing resource with the given values.
     * Because it replaces the resource, only one can be replaced at a time.
     * If you need to replace many resources in a single query, please use patch instead
     *
     * @param id
     * @param values
     * @param options
     */
    @final async replace(id: string, values: this["schemaBuilders"]["replaceValues"]["T"], options?: this["schemaBuilders"]["replaceOptions"]["T"])
        : Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["replaceMeta"]["T"]>> {
        values = _.cloneDeep(values)
        options = _.cloneDeep(options)
        this.handleValidate('replace', () => {
            this.schemaBuilders.replaceValues.validate(values || {});
            this.schemaBuilders.replaceOptions.validate(options || {});
        });

        return this.pipeChain("replace")(id, values, options)
    }

    protected _replace(id, values, options): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["replaceMeta"]["T"]>> {
        throw notImplementedError("replace", Object.getPrototypeOf(this).constructor.name);
    }

    /**
     * Patch resources according to the given query and values.
     * The Query will select a subset of the underlying data source and given `values` are updated on it.
     * This method follow the JSON merge patch standard. @see https://tools.ietf.org/html/rfc7396
     *
     * @param query
     * @param values
     * @param options
     */
    @final async patch(query: this["schemaBuilders"]["patchQuery"]["T"], values: this["schemaBuilders"]["patchValues"]["T"],
        options?: this["schemaBuilders"]["patchOptions"]["T"]): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["patchMeta"]["T"]>> {
        query = _.cloneDeep(query)
        values = _.cloneDeep(values)
        options = _.cloneDeep(options)
        this.handleValidate('patch', () => {
            this.schemaBuilders.patchQuery.validate(query);
            this.schemaBuilders.patchValues.validate(values || {});
            this.schemaBuilders.patchOptions.validate(options || {});
        });
        return this.pipeChain("patch")(query, values, options)
    }

    protected _patch(query, values, options): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["patchMeta"]["T"]>> {
        throw notImplementedError("patch", Object.getPrototypeOf(this).constructor.name);
    }

    /**
     * Delete resources that match th given Query.
     * @param query The query filter to be used for selecting resources to delete
     * @param options Map of options to be used by pipelines
     */
    @final async delete(query: this["schemaBuilders"]["deleteQuery"]["T"], options?: this["schemaBuilders"]["deleteOptions"]["T"])
        : Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["deleteMeta"]["T"]>> {
        query = _.cloneDeep(query)
        options = _.cloneDeep(options)
        this.handleValidate('delete', () => {
            this.schemaBuilders.deleteQuery.validate(query);
            this.schemaBuilders.deleteOptions.validate(options || {});
        });
        return this.pipeChain("delete")(query, options)
    }

    protected _delete(query, options): Promise<ResultsInterface<this["schemaBuilders"]["model"]["T"], this["schemaBuilders"]["deleteMeta"]["T"]>> {
        throw notImplementedError("delete", Object.getPrototypeOf(this).constructor.name);
    }

    private handleValidate(method: string, validate: () => void) {
        try {
            validate();
        } catch (e) {
            throw error('SerafinValidationError', `Validation failed in ${Object.getPrototypeOf(this).constructor.name}::${method}`,
                { constructor: Object.getPrototypeOf(this).constructor.name, method: method }, e);
        }
    }

    clone(): PipelineAbstract<M, S, R> {
        let clonedPipeline = _.cloneDeepWith(this, (value: any, key: number | string | undefined) => {
            if (key === "relations") {
                return _.clone(value)
            }
            if (key === "schemaBuilders") {
                return _.clone(value)
            }
            if (key === "pipes") {
                return value ? value.map((pipe: PipeInterface & PipeAbstract) => pipe.clone()) : _.clone(value)
            }
        })
        for (let pipe of clonedPipeline.pipes) {
            pipe[PIPELINE] = clonedPipeline
        }
        return clonedPipeline
    }
}
