import { compare, hash } from 'bcrypt';

const saltsRounds = 10;

export class Bcrypt {
  static hash = async (password: string) => {
    return await hash(password, saltsRounds);
  };

  static compare = async (password: string, hashed: string) => {
    return await compare(password, hashed);
  };
}
