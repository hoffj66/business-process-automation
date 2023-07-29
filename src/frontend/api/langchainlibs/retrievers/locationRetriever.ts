import axios, { AxiosRequestConfig } from "axios"
import { BaseRetriever } from "langchain/schema/retriever";
import { Document } from "langchain/document";

export class LocationRetriever extends BaseRetriever {
    lc_namespace: string[];

    private _numDocs: number
    private _indexConfig: any

    constructor(parameters: any) {
        super()
        this._numDocs = parameters.numDocs
        this._indexConfig = parameters.indexConfig
    }

    private _search = async (query: string): Promise<any[]> => {
        const headers: AxiosRequestConfig = {
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.COGSEARCH_APIKEY
            }
        }
        let body: any = {
            search: query,
            count: true,
            facets: [],
            filter: "",
            queryType: "semantic",
            skip: 0,
            top: this._numDocs,
            semanticConfiguration: "default",
            answers: "extractive|count-3",
            captions: "extractive|highlight-true",
            searchFields: "address/zip, address/state/name",
            queryLanguage: "en"
        }
        if (this._indexConfig) {
            let url = `${process.env.COGSEARCH_URL}/indexes/${this._indexConfig.name}/docs/search?api-version=2021-04-30-Preview`
            const axiosResult = await axios.post(url, body, headers)


            return axiosResult.data.value
        }
        return []
    }

    private _nextLetter = (index: number) => {
        const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
        return letters[index]
    }

    private _containsCollections = (filters: any, collections: any): boolean => {
        let out = false
        for (const filter of filters) {
            for (const collection of collections) {
                if (filter.field.split('/').includes(collection)) {
                    out = true
                    break
                }
            }

        }
        return out
    }

    private _getText = (searchables, data) => {

        let out = ""
        if(data?.profile?.name){
            out += `Name: ${data.profile.name} `
        }
        if(data?.address?.zip){
            out += `Zip Code: ${data.address.zip} `
        }
        if(data?.address?.state?.name){
            out += `State: ${data.address.state.name}\n`
        }

        return out
    }

    getRelevantDocuments = async (query: string): Promise<Document<Record<string, any>>[]> => {
        const search = await this._search(query)
        const docs: Document<Record<string, any>>[] = []
        for (const v of search) {
            const doc: Document<Record<string, any>> = {
                pageContent: this._getText(this._indexConfig.searchableFields, v),
                metadata: v.address
            }
            docs.push(doc)
        }
        if (docs.length === 0) {
            const doc: Document<Record<string, any>> = {
                pageContent: "No addtional content.",
                metadata: {}
            }
            docs.push(doc)
        }
        return docs
    }

}
