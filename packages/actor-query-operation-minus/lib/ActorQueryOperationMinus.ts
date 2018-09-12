import {IActorInitRdfDereferencePagedArgs} from "@comunica/actor-query-operation-distinct-hash";
import {
    ActorQueryOperation, ActorQueryOperationTypedMediated, Bindings, BindingsStream,
    IActorQueryOperationOutputBindings,
} from "@comunica/bus-query-operation";
import {ActionContext, IActorTest} from "@comunica/core";
import {createHash, getHashes, Hash} from "crypto";
import {Algebra} from "sparqlalgebrajs";

/**
 * A comunica Minus Query Operation Actor.
 */
export class ActorQueryOperationMinus extends ActorQueryOperationTypedMediated<Algebra.Minus> {

  public readonly hashAlgorithm: string;
  public readonly digestAlgorithm: string;

  constructor(args: IActorInitRdfDereferencePagedArgs) {
    super(args, 'minus');
    if (!ActorQueryOperationMinus.doesHashAlgorithmExist(this.hashAlgorithm)) {
      throw new Error("The given hash algorithm is not present in this version of Node: " + this.hashAlgorithm);
    }
    if (!ActorQueryOperationMinus.doesDigestAlgorithmExist(this.digestAlgorithm)) {
      throw new Error("The given digest algorithm is not present in this version of Node: " + this.digestAlgorithm);
    }
  }

    /**
     * Check if the given hash algorithm (such as sha1) exists.
     * @param {string} hashAlgorithm A hash algorithm.
     * @return {boolean} If it exists.
     */
  public static doesHashAlgorithmExist(hashAlgorithm: string): boolean {
    return getHashes().indexOf(hashAlgorithm) >= 0;
  }

    /**
     * Check if the given digest (such as base64) algorithm exists.
     * @param {string} digestAlgorithm A digest algorithm.
     * @return {boolean} If it exists.
     */
  public static doesDigestAlgorithmExist(digestAlgorithm: string): boolean {
    return [ "latin1", "hex", "base64" ].indexOf(digestAlgorithm) >= 0;
  }

    /**
     * Create a string-based hash of the given object.
     * @param {string} hashAlgorithm A hash algorithm.
     * @param {string} digestAlgorithm A digest algorithm.
     * @param object The object to hash.
     * @return {string} The object's hash.
     */
  public static hash(hashAlgorithm: string, digestAlgorithm: string, object: any): string {
    const hash: Hash = createHash(hashAlgorithm);
    hash.update(require('json-stable-stringify')(object));
    return hash.digest(<any> digestAlgorithm);
  }

  public async testOperation(pattern: Algebra.Minus, context: ActionContext): Promise<IActorTest> {
    return true;
  }

  public async runOperation(pattern: Algebra.Minus, context: ActionContext)
      : Promise<IActorQueryOperationOutputBindings> {

    const buffer = ActorQueryOperation.getSafeBindings(
          await this.mediatorQueryOperation.mediate({ operation: pattern.right, context }));
    const output = ActorQueryOperation.getSafeBindings(
          await this.mediatorQueryOperation.mediate({ operation: pattern.left, context }));

    if (this.haveCommonVariables(buffer.variables, output.variables)) {
      const hashes: {[id: string]: boolean} = {};
      let bindingsStream: BindingsStream = null;
      const prom = new Promise((resolve) => {
        bindingsStream = buffer.bindingsStream;
        bindingsStream.on('data', (data) => {
          const hash = ActorQueryOperationMinus.hash(this.hashAlgorithm, this.digestAlgorithm, data);
          hashes[hash] = true;
        });
        bindingsStream.on('end', () => {
          resolve();
        });
        return hashes;
      });
      await prom;

      bindingsStream = output.bindingsStream.filter(
              this.newHashFilter(this.hashAlgorithm, this.digestAlgorithm, hashes));
      return { type: 'bindings', bindingsStream, variables: output.variables, metadata: output.metadata};
    } else {
      return output;
    }

  }

  private newHashFilter(hashAlgorithm: string, digestAlgorithm: string, hashes: {[id: string]: boolean})
    : (bindings: Bindings) => boolean {
    return (bindings: Bindings) => {
      const hash: string = ActorQueryOperationMinus.hash(hashAlgorithm, digestAlgorithm, bindings);
      return !(hash in hashes);
    };
  }

  private haveCommonVariables(array1: string[], array2: string[]): boolean {
    for (const element of array1) {
      if (array2.indexOf(element) > -1) {
        return true;
      }
    }
    return false;
  }
}
